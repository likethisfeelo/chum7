/**
 * Challenge Lifecycle Manager
 *
 * EventBridge 매 1시간 실행.
 * 현재 시각 기준으로 챌린지 상태를 자동 전환한다.
 *
 * Transition Rules:
 *   draft       → recruiting   : recruitingStartAt <= now
 *   recruiting  → preparing    : recruitingEndAt   <= now
 *   preparing   → active       : challengeStartAt  <= now
 *                                (requireStartConfirmation=true 이면 startConfirmedAt 필요)
 *   active      → completed    : challengeEndAt    <= now
 *
 * UserChallenge Side Effects:
 *   preparing → active       : joinStatus='requested' 참여자 자동 거절
 *                              userChallenge.phase = 'active', currentDay = 1 (승인된 참여자)
 *   active    → completed    : userChallenge.status = 'completed' | 'failed'
 *                              (7/7 완료 시 completed, 미달성 시 failed)
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { sendNotification } from '../../../shared/lib/notification';
import { calculateChallengeEndAt, calculateSyncedCurrentDay, resolveChallengeActualStartAt, resolveDurationDays } from '../../../shared/lib/challenge-day-sync';
import { normalizeProgress } from '../../../shared/lib/progress';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CHALLENGES_TABLE = process.env.CHALLENGES_TABLE!;
const USER_CHALLENGES_TABLE = process.env.USER_CHALLENGES_TABLE!;
const PERSONAL_QUEST_PROPOSALS_TABLE = process.env.PERSONAL_QUEST_PROPOSALS_TABLE!;

type Lifecycle = 'draft' | 'recruiting' | 'preparing' | 'active' | 'completed' | 'archived';

interface TransitionRule {
  from: Lifecycle;
  to: Lifecycle;
  condition: (item: any, now: string) => boolean;
}

const TRANSITION_RULES: TransitionRule[] = [
  {
    from: 'draft',
    to: 'recruiting',
    condition: (item, now) => item.recruitingStartAt <= now,
  },
  {
    from: 'recruiting',
    to: 'preparing',
    condition: (item, now) => item.recruitingEndAt <= now,
  },
  {
    from: 'preparing',
    to: 'active',
    condition: (item, now) => {
      if (item.challengeStartAt > now) return false;
      if (!item.requireStartConfirmation) return true;
      return !!item.startConfirmedAt;
    },
  },
  {
    from: 'active',
    to: 'completed',
    condition: (item, now) => {
      const actualStartAt = resolveChallengeActualStartAt(item);
      const endAt = actualStartAt
        ? calculateChallengeEndAt(actualStartAt, resolveDurationDays(item.durationDays, undefined))
        : item.challengeEndAt;
      return typeof endAt === 'string' && endAt <= now;
    },
  },
];

async function queryChallengesByLifecycle(lifecycle: string): Promise<any[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: CHALLENGES_TABLE,
      IndexName: 'lifecycle-index',
      KeyConditionExpression: 'lifecycle = :lc',
      ExpressionAttributeValues: { ':lc': lifecycle },
    })
  );

  return result.Items ?? [];
}

async function transitionChallenge(challengeId: string, from: Lifecycle, to: Lifecycle): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: CHALLENGES_TABLE,
      Key: { challengeId },
      UpdateExpression: 'SET lifecycle = :to, updatedAt = :now',
      ConditionExpression: 'lifecycle = :from',
      ExpressionAttributeValues: {
        ':from': from,
        ':to': to,
        ':now': new Date().toISOString(),
      },
    })
  );
}


async function syncChallengeScheduleOnActivation(challenge: any, nowIso: string): Promise<void> {
  const challengeId = challenge?.challengeId;
  if (!challengeId) return;

  const actualStartAt = resolveChallengeActualStartAt(challenge) || nowIso;
  const durationDays = resolveDurationDays(challenge?.durationDays, undefined);
  const challengeEndAt = calculateChallengeEndAt(actualStartAt, durationDays);

  await docClient.send(
    new UpdateCommand({
      TableName: CHALLENGES_TABLE,
      Key: { challengeId },
      UpdateExpression: 'SET actualStartAt = if_not_exists(actualStartAt, :actualStartAt), challengeEndAt = :challengeEndAt, updatedAt = :now',
      ExpressionAttributeValues: {
        ':actualStartAt': actualStartAt,
        ':challengeEndAt': challengeEndAt,
        ':now': nowIso,
      },
    })
  );
}

async function handleUnapprovedJoinRequests(challengeId: string, challenge: any): Promise<void> {
  let lastKey: any = undefined;
  let rejectedCount = 0;
  const now = new Date().toISOString();

  do {
    const result: any = await docClient.send(
      new QueryCommand({
        TableName: USER_CHALLENGES_TABLE,
        IndexName: 'challengeId-index',
        KeyConditionExpression: 'challengeId = :cid',
        FilterExpression: 'phase = :phase AND joinStatus = :requested',
        ExpressionAttributeValues: {
          ':cid': challengeId,
          ':phase': 'preparing',
          ':requested': 'requested',
        },
        ExclusiveStartKey: lastKey,
      })
    );

    for (const uc of result.Items ?? []) {
      const isPaid = uc.paymentStatus && uc.paymentStatus !== 'free';
      const extraUpdate = isPaid
        ? ', paymentStatus = :refunded, refundStatus = :completed'
        : '';
      const extraValues: Record<string, any> = isPaid
        ? { ':refunded': 'refunded', ':completed': 'completed' }
        : {};

      await docClient.send(
        new UpdateCommand({
          TableName: USER_CHALLENGES_TABLE,
          Key: { userChallengeId: uc.userChallengeId },
          UpdateExpression: `SET #status = :failed, joinStatus = :rejected, phase = :failed${extraUpdate}, updatedAt = :now`,
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':failed': 'failed',
            ':rejected': 'rejected',
            ':now': now,
            ...extraValues,
          },
        })
      );

      await sendNotification({
        recipientId: uc.userId,
        type: 'join_request_auto_rejected',
        title: '참여 신청이 자동 취소됐어요',
        body: '챌린지 시작 전 승인이 완료되지 않아 참여 신청이 자동 취소되었습니다.',
        relatedId: challengeId,
        relatedType: 'challenge',
      });

      rejectedCount++;
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  if (rejectedCount > 0) {
    // stats.pendingParticipants 감소
    await docClient.send(
      new UpdateCommand({
        TableName: CHALLENGES_TABLE,
        Key: { challengeId },
        UpdateExpression:
          'SET stats.pendingParticipants = if_not_exists(stats.pendingParticipants, :zero) - :count, updatedAt = :now',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':count': rejectedCount,
          ':now': now,
        },
      })
    );

    if (challenge.createdBy) {
      await sendNotification({
        recipientId: challenge.createdBy,
        type: 'join_requests_auto_rejected',
        title: `${rejectedCount}명의 참여 신청이 자동 취소됐어요`,
        body: `챌린지가 시작되어 미승인 참여 신청 ${rejectedCount}건이 자동으로 취소되었습니다.`,
        relatedId: challengeId,
        relatedType: 'challenge',
      });
    }
  }
}

async function activateUserChallenges(challengeId: string): Promise<void> {
  // phase: preparing → active, currentDay = 1 (joinStatus='approved' 참여자만)
  let lastKey: any = undefined;

  do {
    const result: any = await docClient.send(
      new QueryCommand({
        TableName: USER_CHALLENGES_TABLE,
        IndexName: 'challengeId-index',
        KeyConditionExpression: 'challengeId = :cid',
        FilterExpression: 'phase = :phase AND (joinStatus = :approved OR attribute_not_exists(joinStatus))',
        ExpressionAttributeValues: {
          ':cid': challengeId,
          ':phase': 'preparing',
          ':approved': 'approved',
        },
        ExclusiveStartKey: lastKey,
      })
    );

    const updates = (result.Items ?? []).map((uc: any) =>
      docClient.send(
        new UpdateCommand({
          TableName: USER_CHALLENGES_TABLE,
          Key: { userChallengeId: uc.userChallengeId },
          UpdateExpression: 'SET phase = :active, currentDay = :day, updatedAt = :now',
          ExpressionAttributeValues: {
            ':active': 'active',
            ':day': 1,
            ':now': new Date().toISOString(),
          },
        })
      )
    );

    await Promise.all(updates);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
}

async function finalizeUserChallenges(challengeId: string, durationDays: number): Promise<void> {
  // status: active → completed | failed
  let lastKey: any = undefined;

  do {
    const result: any = await docClient.send(
      new QueryCommand({
        TableName: USER_CHALLENGES_TABLE,
        IndexName: 'challengeId-index',
        KeyConditionExpression: 'challengeId = :cid',
        FilterExpression: 'phase = :phase',
        ExpressionAttributeValues: {
          ':cid': challengeId,
          ':phase': 'active',
        },
        ExclusiveStartKey: lastKey,
      })
    );

    const now = new Date().toISOString();
    const updates = (result.Items ?? []).map((uc: any) => {
      const completedDays = normalizeProgress(uc.progress).filter((p: any) => p.status === 'success').length;
      const finalStatus = completedDays >= durationDays ? 'completed' : 'failed';

      return docClient.send(
        new UpdateCommand({
          TableName: USER_CHALLENGES_TABLE,
          Key: { userChallengeId: uc.userChallengeId },
          UpdateExpression: 'SET phase = :phase, #status = :status, updatedAt = :now',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':phase': finalStatus,
            ':status': finalStatus,
            ':now': now,
          },
        })
      );
    });

    await Promise.all(updates);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
}

async function syncActiveUserChallengeDays(challengeId: string, durationDays: number, nowIso: string): Promise<void> {
  let lastKey: any = undefined;
  let updatedCount = 0;
  let scannedCount = 0;
  let skippedNoStartDateCount = 0;
  let skippedAlreadyUpToDateCount = 0;
  let correctedCorruptedHighDayCount = 0;
  let conditionalRaceSkipCount = 0;

  do {
    const result: any = await docClient.send(
      new QueryCommand({
        TableName: USER_CHALLENGES_TABLE,
        IndexName: 'challengeId-index',
        KeyConditionExpression: 'challengeId = :cid',
        FilterExpression: 'phase = :phase AND #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':cid': challengeId,
          ':phase': 'active',
          ':status': 'active',
        },
        ExclusiveStartKey: lastKey,
      })
    );

    for (const uc of result.Items ?? []) {
      scannedCount += 1;
      if (!uc.startDate) {
        skippedNoStartDateCount += 1;
        continue;
      }

      const nextDay = calculateSyncedCurrentDay(
        uc.startDate,
        nowIso,
        uc.timezone,
        durationDays,
      );
      const maxDay = Math.max(1, durationDays) + 1;
      const rawCurrentDay = Number(uc.currentDay);
      const currentDay = Number.isFinite(rawCurrentDay)
        ? Math.max(1, Math.min(maxDay, Math.floor(rawCurrentDay)))
        : 1;
      const hasCorruptedHighDay = Number.isFinite(rawCurrentDay) && rawCurrentDay > maxDay;
      if (hasCorruptedHighDay) correctedCorruptedHighDayCount += 1;

      if (!Number.isFinite(nextDay) || (!hasCorruptedHighDay && nextDay <= currentDay)) {
        skippedAlreadyUpToDateCount += 1;
        continue;
      }

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: USER_CHALLENGES_TABLE,
            Key: { userChallengeId: uc.userChallengeId },
            UpdateExpression: 'SET currentDay = :day, updatedAt = :now',
            ConditionExpression: 'phase = :phase AND #status = :status AND (attribute_not_exists(currentDay) OR currentDay < :day OR currentDay > :maxDay)',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':day': nextDay,
              ':now': nowIso,
              ':phase': 'active',
              ':status': 'active',
              ':maxDay': maxDay,
            },
          })
        );
        updatedCount += 1;
      } catch (err: any) {
        if (err?.name !== 'ConditionalCheckFailedException') {
          throw err;
        }
        conditionalRaceSkipCount += 1;
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  console.log(
    `[lifecycle-manager] currentDay sync summary challenge=${challengeId} scanned=${scannedCount} updated=${updatedCount} skippedNoStartDate=${skippedNoStartDateCount} skippedUpToDate=${skippedAlreadyUpToDateCount} correctedCorruptedHighDay=${correctedCorruptedHighDayCount} conditionalRaceSkip=${conditionalRaceSkipCount}`
  );
}

async function expirePendingProposals(challenge: any): Promise<void> {
  if (!challenge.personalQuestEnabled || challenge.personalQuestAutoApprove) return;

  const targetStatuses = ['pending', 'revision_pending', 'rejected'];
  for (const targetStatus of targetStatuses) {
    let lastKey: any = undefined;

    do {
      const result: any = await docClient.send(
        new QueryCommand({
          TableName: PERSONAL_QUEST_PROPOSALS_TABLE,
          IndexName: 'challengeId-status-index',
          KeyConditionExpression: 'challengeId = :cid AND #status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':cid': challenge.challengeId, ':status': targetStatus },
          ExclusiveStartKey: lastKey,
        })
      );

      for (const proposal of result.Items ?? []) {
        await docClient.send(
          new UpdateCommand({
            TableName: PERSONAL_QUEST_PROPOSALS_TABLE,
            Key: { proposalId: proposal.proposalId },
            UpdateExpression: 'SET #status = :expired, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':expired': 'expired', ':now': new Date().toISOString() },
          })
        );

        await docClient.send(
          new UpdateCommand({
            TableName: USER_CHALLENGES_TABLE,
            Key: { userChallengeId: proposal.userChallengeId },
            UpdateExpression: 'SET #status = :status, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':status': 'disqualified', ':now': new Date().toISOString() },
          })
        );

        await sendNotification({
          recipientId: proposal.userId,
          type: 'quest_proposal_expired',
          title: '개인 퀘스트 없이 챌린지가 시작돼요',
          body: '리더 피드백 반영 기간이 지나 개인 퀘스트 제안이 만료됐어요. 리더 퀘스트에 집중해보세요!',
          relatedId: proposal.proposalId,
          relatedType: 'personal_quest_proposal',
        });
      }

      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
  }
}

async function notifyPreparingEntry(challenge: any): Promise<void> {
  if (!challenge.createdBy) return;

  const startDate = new Date(challenge.challengeStartAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const body = challenge.requireStartConfirmation
    ? `'${challenge.title}' 챌린지 모집이 마감됐어요. ${startDate}에 시작 예정입니다. 시작 전 확인 버튼을 눌러 챌린지를 시작해주세요.`
    : `'${challenge.title}' 챌린지 모집이 마감됐어요. ${startDate}에 자동으로 시작됩니다.`;

  await sendNotification({
    recipientId: challenge.createdBy,
    type: 'challenge_preparing',
    title: '챌린지 모집이 마감됐어요',
    body,
    relatedId: challenge.challengeId,
    relatedType: 'challenge',
  });
}

async function notifyStartDelay(challenge: any): Promise<void> {
  const now = new Date().toISOString();

  // 어드민 알림
  if (challenge.createdBy) {
    await sendNotification({
      recipientId: challenge.createdBy,
      type: 'challenge_start_confirmation_required',
      title: '챌린지 시작 확인이 필요해요',
      body: `'${challenge.title}' 챌린지 시작일이 지났습니다. 지금 확인하거나 시작일을 변경해주세요.`,
      relatedId: challenge.challengeId,
      relatedType: 'challenge',
    });
  }

  // 참여자 알림 (승인된 참여자들)
  let lastKey: any = undefined;
  do {
    const result: any = await docClient.send(
      new QueryCommand({
        TableName: USER_CHALLENGES_TABLE,
        IndexName: 'challengeId-index',
        KeyConditionExpression: 'challengeId = :cid',
        FilterExpression: 'phase = :phase AND joinStatus = :approved',
        ExpressionAttributeValues: {
          ':cid': challenge.challengeId,
          ':phase': 'preparing',
          ':approved': 'approved',
        },
        ExclusiveStartKey: lastKey,
      })
    );

    for (const uc of result.Items ?? []) {
      await sendNotification({
        recipientId: uc.userId,
        type: 'challenge_start_delayed',
        title: '챌린지 시작이 지연되고 있어요',
        body: `'${challenge.title}' 챌린지 시작이 지연되고 있습니다. 리더의 확인을 기다리고 있어요.`,
        relatedId: challenge.challengeId,
        relatedType: 'challenge',
      });
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  console.log(`[lifecycle-manager] Start delay notified for ${challenge.challengeId} at ${now}`);
}

export const handler = async (): Promise<void> => {
  const now = new Date().toISOString();
  console.log(`[lifecycle-manager] Running at ${now}`);

  const transitionSummary: Array<{
    from: string;
    to: string;
    candidates: number;
    transitioned: number;
    conditionalSkipped: number;
    failed: number;
  }> = [];

  for (const rule of TRANSITION_RULES) {
    const challenges = await queryChallengesByLifecycle(rule.from);
    const targets = challenges.filter((c) => rule.condition(c, now));

    console.log(`[lifecycle-manager] ${rule.from} → ${rule.to}: ${targets.length} candidates`);

    let transitioned = 0;
    let conditionalSkipped = 0;
    let failed = 0;

    for (const challenge of targets) {
      try {
        await transitionChallenge(challenge.challengeId, rule.from, rule.to);
        transitioned += 1;
        console.log(`[lifecycle-manager] Transitioned ${challenge.challengeId}: ${rule.from} → ${rule.to}`);

        if (rule.from === 'recruiting' && rule.to === 'preparing') {
          await notifyPreparingEntry(challenge);
        }

        if (rule.from === 'preparing' && rule.to === 'active') {
          await syncChallengeScheduleOnActivation(challenge, now);
          await handleUnapprovedJoinRequests(challenge.challengeId, challenge);
          await expirePendingProposals(challenge);
          await activateUserChallenges(challenge.challengeId);
        }

        if (rule.from === 'active' && rule.to === 'completed') {
          await finalizeUserChallenges(challenge.challengeId, resolveDurationDays(challenge.durationDays, undefined));
        }
      } catch (err: any) {
        if (err.name === 'ConditionalCheckFailedException') {
          conditionalSkipped += 1;
          continue;
        }

        failed += 1;
        console.error(`[lifecycle-manager] Error transitioning ${challenge.challengeId}:`, err);
      }
    }

    transitionSummary.push({
      from: rule.from,
      to: rule.to,
      candidates: targets.length,
      transitioned,
      conditionalSkipped,
      failed,
    });
  }

  console.log(`[lifecycle-manager] transition summary ${JSON.stringify(transitionSummary)}`);

  const activeChallenges = await queryChallengesByLifecycle('active');
  for (const challenge of activeChallenges) {
    try {
      await syncActiveUserChallengeDays(
        challenge.challengeId,
        resolveDurationDays(challenge.durationDays, undefined),
        now,
      );
    } catch (err) {
      console.error(`[lifecycle-manager] Error syncing currentDay for ${challenge.challengeId}:`, err);
    }
  }

  // 시작 확인 필요 챌린지 중 시작일이 지났으나 미확인인 챌린지에 지연 알림 발송
  const preparingChallenges = await queryChallengesByLifecycle('preparing');
  for (const challenge of preparingChallenges) {
    if (
      challenge.requireStartConfirmation &&
      !challenge.startConfirmedAt &&
      challenge.challengeStartAt <= now
    ) {
      try {
        await notifyStartDelay(challenge);
      } catch (err) {
        console.error(`[lifecycle-manager] Error sending delay notification for ${challenge.challengeId}:`, err);
      }
    }
  }

  console.log('[lifecycle-manager] Done');
};
