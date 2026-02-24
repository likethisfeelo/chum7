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
 *   active      → completed    : challengeEndAt    <= now
 *
 * UserChallenge Side Effects:
 *   preparing → active       : userChallenge.phase = 'active', currentDay = 1
 *   active    → completed    : userChallenge.status = 'completed' | 'failed'
 *                              (7/7 완료 시 completed, 미달성 시 failed)
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CHALLENGES_TABLE = process.env.CHALLENGES_TABLE!;
const USER_CHALLENGES_TABLE = process.env.USER_CHALLENGES_TABLE!;

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
    condition: (item, now) => item.challengeStartAt <= now,
  },
  {
    from: 'active',
    to: 'completed',
    condition: (item, now) => item.challengeEndAt <= now,
  },
];

async function queryChallengesByLifecycle(lifecycle: string): Promise<any[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: CHALLENGES_TABLE,
    IndexName: 'lifecycle-index',
    KeyConditionExpression: 'lifecycle = :lc',
    ExpressionAttributeValues: { ':lc': lifecycle },
  }));
  return result.Items ?? [];
}

async function transitionChallenge(challengeId: string, from: Lifecycle, to: Lifecycle): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: CHALLENGES_TABLE,
    Key: { challengeId },
    UpdateExpression: 'SET lifecycle = :to, updatedAt = :now',
    ConditionExpression: 'lifecycle = :from',
    ExpressionAttributeValues: {
      ':from': from,
      ':to': to,
      ':now': new Date().toISOString(),
    },
  }));
}

async function activateUserChallenges(challengeId: string): Promise<void> {
  // phase: preparing → active, currentDay = 1
  let lastKey: any = undefined;
  do {
    const result: any = await docClient.send(new QueryCommand({
      TableName: USER_CHALLENGES_TABLE,
      IndexName: 'challengeId-index',
      KeyConditionExpression: 'challengeId = :cid',
      FilterExpression: 'phase = :phase',
      ExpressionAttributeValues: {
        ':cid': challengeId,
        ':phase': 'preparing',
      },
      ExclusiveStartKey: lastKey,
    }));

    const updates = (result.Items ?? []).map((uc: any) =>
      docClient.send(new UpdateCommand({
        TableName: USER_CHALLENGES_TABLE,
        Key: { userChallengeId: uc.userChallengeId },
        UpdateExpression: 'SET phase = :active, currentDay = :day, updatedAt = :now',
        ExpressionAttributeValues: {
          ':active': 'active',
          ':day': 1,
          ':now': new Date().toISOString(),
        },
      }))
    );
    await Promise.all(updates);

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
}

async function finalizeUserChallenges(challengeId: string, durationDays: number): Promise<void> {
  // status: active → completed | failed
  let lastKey: any = undefined;
  do {
    const result: any = await docClient.send(new QueryCommand({
      TableName: USER_CHALLENGES_TABLE,
      IndexName: 'challengeId-index',
      KeyConditionExpression: 'challengeId = :cid',
      FilterExpression: 'phase = :phase',
      ExpressionAttributeValues: {
        ':cid': challengeId,
        ':phase': 'active',
      },
      ExclusiveStartKey: lastKey,
    }));

    const now = new Date().toISOString();
    const updates = (result.Items ?? []).map((uc: any) => {
      const completedDays = (uc.progress ?? []).filter((p: any) => p.status === 'success').length;
      const finalStatus = completedDays >= durationDays ? 'completed' : 'failed';
      const finalPhase = finalStatus;

      return docClient.send(new UpdateCommand({
        TableName: USER_CHALLENGES_TABLE,
        Key: { userChallengeId: uc.userChallengeId },
        UpdateExpression: 'SET phase = :phase, #status = :status, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':phase': finalPhase,
          ':status': finalStatus,
          ':now': now,
        },
      }));
    });
    await Promise.all(updates);

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
}

export const handler = async (): Promise<void> => {
  const now = new Date().toISOString();
  console.log(`[lifecycle-manager] Running at ${now}`);

  for (const rule of TRANSITION_RULES) {
    const challenges = await queryChallengesByLifecycle(rule.from);
    const targets = challenges.filter(c => rule.condition(c, now));

    console.log(`[lifecycle-manager] ${rule.from} → ${rule.to}: ${targets.length} candidates`);

    for (const challenge of targets) {
      try {
        await transitionChallenge(challenge.challengeId, rule.from, rule.to);
        console.log(`[lifecycle-manager] Transitioned ${challenge.challengeId}: ${rule.from} → ${rule.to}`);

        // 전환 후 side effect 처리
        if (rule.from === 'preparing' && rule.to === 'active') {
          await activateUserChallenges(challenge.challengeId);
        }
        if (rule.from === 'active' && rule.to === 'completed') {
          await finalizeUserChallenges(challenge.challengeId, challenge.durationDays ?? 7);
        }
      } catch (err: any) {
        // ConditionalCheckFailedException = 다른 프로세스가 먼저 처리함 (무시)
        if (err.name !== 'ConditionalCheckFailedException') {
          console.error(`[lifecycle-manager] Error transitioning ${challenge.challengeId}:`, err);
        }
      }
    }
  }

  console.log('[lifecycle-manager] Done');
};
