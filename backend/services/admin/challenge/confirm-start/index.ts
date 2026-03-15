/**
 * Confirm Start (Admin)
 *
 * requireStartConfirmation=true인 챌린지에서 어드민이 시작을 확인하는 엔드포인트.
 * 챌린지를 즉시 preparing → active로 전환하고 관련 side effect를 처리한다.
 *
 * POST /admin/challenges/{challengeId}/confirm-start
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { sendNotification } from '../../../../shared/lib/notification';
import { calculateChallengeEndAt, resolveDurationDays } from '../../../../shared/lib/challenge-day-sync';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CHALLENGES_TABLE = process.env.CHALLENGES_TABLE!;
const USER_CHALLENGES_TABLE = process.env.USER_CHALLENGES_TABLE!;
const PERSONAL_QUEST_PROPOSALS_TABLE = process.env.PERSONAL_QUEST_PROPOSALS_TABLE!;

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

function parseGroups(rawGroups: unknown): string[] {
  if (!rawGroups) return [];
  if (Array.isArray(rawGroups)) return rawGroups.map(String).map(g => g.trim()).filter(Boolean);
  if (typeof rawGroups !== 'string') return [];
  const value = rawGroups.trim();
  if (!value) return [];
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).map(g => g.trim()).filter(Boolean);
    } catch { /* fall through */ }
  }
  return value.split(/[,:]/).map(g => g.replace(/[\[\]"']/g, '').trim()).filter(Boolean);
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
      const extraUpdate = isPaid ? ', paymentStatus = :refunded, refundStatus = :completed' : '';
      const extraValues: Record<string, any> = isPaid ? { ':refunded': 'refunded', ':completed': 'completed' } : {};

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
    await docClient.send(
      new UpdateCommand({
        TableName: CHALLENGES_TABLE,
        Key: { challengeId },
        UpdateExpression:
          'SET stats.pendingParticipants = if_not_exists(stats.pendingParticipants, :zero) - :count, updatedAt = :now',
        ExpressionAttributeValues: { ':zero': 0, ':count': rejectedCount, ':now': now },
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

async function activateUserChallenges(challengeId: string, challengeTitle: string): Promise<void> {
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

    const now = new Date().toISOString();
    for (const uc of result.Items ?? []) {
      await docClient.send(
        new UpdateCommand({
          TableName: USER_CHALLENGES_TABLE,
          Key: { userChallengeId: uc.userChallengeId },
          UpdateExpression: 'SET phase = :active, currentDay = :day, updatedAt = :now',
          ExpressionAttributeValues: { ':active': 'active', ':day': 1, ':now': now },
        })
      );

      await sendNotification({
        recipientId: uc.userId,
        type: 'challenge_started',
        title: '챌린지가 시작됐어요!',
        body: `'${challengeTitle}' 챌린지가 시작되었습니다. 오늘부터 Day 1을 시작해보세요!`,
        relatedId: challengeId,
        relatedType: 'challenge',
      });
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const challengeId = event.pathParameters?.challengeId;

    if (!requesterId) return response(401, { error: 'UNAUTHORIZED' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });

    const challengeRes = await docClient.send(
      new GetCommand({ TableName: CHALLENGES_TABLE, Key: { challengeId } })
    );
    const challenge = challengeRes.Item;

    if (!challenge) return response(404, { error: 'CHALLENGE_NOT_FOUND' });

    // 권한 확인: 생성자 또는 admins/productowners 그룹
    const groupsRaw = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
    const groups = parseGroups(groupsRaw);
    const isPrivileged = groups.some(g => ['admins', 'productowners'].includes(g));
    const isCreator = challenge.createdBy === requesterId;

    if (!isPrivileged && !isCreator) {
      return response(403, { error: 'FORBIDDEN', message: '챌린지 생성자 또는 관리자만 확인할 수 있습니다.' });
    }

    if (challenge.lifecycle !== 'preparing') {
      return response(409, {
        error: 'INVALID_LIFECYCLE',
        message: `preparing 상태의 챌린지만 시작 확인할 수 있습니다. 현재 상태: ${challenge.lifecycle}`,
      });
    }

    if (!challenge.requireStartConfirmation) {
      return response(409, {
        error: 'CONFIRMATION_NOT_REQUIRED',
        message: '이 챌린지는 시작 전 확인이 필요하지 않습니다. 자동으로 시작됩니다.',
      });
    }

    const now = new Date().toISOString();
    const durationDays = resolveDurationDays(challenge.durationDays, undefined);
    const recalculatedEndAt = calculateChallengeEndAt(now, durationDays);

    // startConfirmedAt/startConfirmedBy + 실제 시작(actualStartAt) 반영 후 lifecycle → active
    await docClient.send(
      new UpdateCommand({
        TableName: CHALLENGES_TABLE,
        Key: { challengeId },
        UpdateExpression:
          'SET lifecycle = :active, startConfirmedAt = :now, startConfirmedBy = :by, actualStartAt = if_not_exists(actualStartAt, :now), challengeEndAt = :endAt, updatedAt = :now',
        ConditionExpression: 'lifecycle = :preparing',
        ExpressionAttributeValues: {
          ':active': 'active',
          ':preparing': 'preparing',
          ':now': now,
          ':endAt': recalculatedEndAt,
          ':by': requesterId,
        },
      })
    );

    // Side effects
    await handleUnapprovedJoinRequests(challengeId, challenge);
    await expirePendingProposals(challenge);
    await activateUserChallenges(challengeId, challenge.title);

    return response(200, {
      success: true,
      message: '챌린지가 시작되었습니다.',
      data: {
        challengeId,
        lifecycle: 'active',
        startConfirmedAt: now,
        startConfirmedBy: requesterId,
      },
    });
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      return response(409, { error: 'ALREADY_TRANSITIONED_OR_INVALID_STATE' });
    }
    console.error('confirm-start error', err);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
