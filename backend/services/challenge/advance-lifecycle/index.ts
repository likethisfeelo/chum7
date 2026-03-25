/**
 * Challenge Advance Lifecycle (creator manual transition)
 *
 * PATCH /challenges/{challengeId}/advance-lifecycle
 * Body: { action: 'close_recruiting' | 'confirm_start' }
 *
 * close_recruiting : recruiting  → preparing  (모집 수동 마감)
 * confirm_start    : preparing   → active     (챌린지 수동 시작)
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  resolveChallengeActualStartAt,
  calculateChallengeEndAt,
  resolveDurationDays,
} from '../../../shared/lib/challenge-day-sync';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

function res(statusCode: number, body: unknown): APIGatewayProxyResult {
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

type Action = 'close_recruiting' | 'confirm_start';

const TRANSITION: Record<Action, { from: string; to: string; label: string }> = {
  close_recruiting: { from: 'recruiting', to: 'preparing', label: '모집이 마감됐어요' },
  confirm_start: { from: 'preparing', to: 'active', label: '챌린지가 시작됐어요 🎉' },
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) return res(401, { error: 'UNAUTHORIZED' });

    const { challengeId } = event.pathParameters ?? {};
    if (!challengeId) return res(400, { error: 'MISSING_CHALLENGE_ID' });

    const body = JSON.parse(event.body || '{}');
    const action: Action = body.action;
    if (!action || !TRANSITION[action]) {
      return res(400, { error: 'INVALID_ACTION', message: 'action must be close_recruiting or confirm_start' });
    }

    const { from, to, label } = TRANSITION[action];

    const challengeRes = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    const challenge = challengeRes.Item;
    if (!challenge) return res(404, { error: 'CHALLENGE_NOT_FOUND' });
    if (challenge.createdBy !== userId) return res(403, { error: 'FORBIDDEN' });
    if (challenge.lifecycle !== from) {
      return res(409, { error: 'INVALID_LIFECYCLE', message: `현재 상태(${challenge.lifecycle})에서는 이 작업을 수행할 수 없어요` });
    }

    const now = new Date().toISOString();

    let additionalUpdate = '';
    const additionalValues: Record<string, unknown> = {};

    if (action === 'confirm_start') {
      // startConfirmedAt 기록 + actualStartAt / challengeEndAt 계산
      const actualStartAt = resolveChallengeActualStartAt(challenge) || now;
      const durationDays = resolveDurationDays(challenge.durationDays, undefined);
      const challengeEndAt = calculateChallengeEndAt(actualStartAt, durationDays);

      additionalUpdate = ', startConfirmedAt = :confirmedAt, actualStartAt = if_not_exists(actualStartAt, :actualStart), challengeEndAt = :endAt';
      additionalValues[':confirmedAt'] = now;
      additionalValues[':actualStart'] = actualStartAt;
      additionalValues[':endAt'] = challengeEndAt;

      // 승인된 참여자들 phase: preparing → active, currentDay = 1
      let lastKey: any = undefined;
      do {
        const ucRes: any = await docClient.send(new QueryCommand({
          TableName: process.env.USER_CHALLENGES_TABLE!,
          IndexName: 'challengeId-index',
          KeyConditionExpression: 'challengeId = :cid',
          FilterExpression: 'phase = :phase AND (joinStatus = :approved OR attribute_not_exists(joinStatus))',
          ExpressionAttributeValues: { ':cid': challengeId, ':phase': 'preparing', ':approved': 'approved' },
          ExclusiveStartKey: lastKey,
        }));

        await Promise.all(
          (ucRes.Items ?? []).map((uc: any) =>
            docClient.send(new UpdateCommand({
              TableName: process.env.USER_CHALLENGES_TABLE!,
              Key: { userChallengeId: uc.userChallengeId },
              UpdateExpression: 'SET phase = :active, currentDay = :day, startDate = if_not_exists(startDate, :today), updatedAt = :now',
              ExpressionAttributeValues: { ':active': 'active', ':day': 1, ':today': now.slice(0, 10), ':now': now },
            }))
          )
        );

        lastKey = ucRes.LastEvaluatedKey;
      } while (lastKey);
    }

    await docClient.send(new UpdateCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      UpdateExpression: `SET lifecycle = :to, updatedAt = :now${additionalUpdate}`,
      ConditionExpression: 'lifecycle = :from',
      ExpressionAttributeValues: { ':from': from, ':to': to, ':now': now, ...additionalValues },
    }));

    return res(200, {
      success: true,
      message: label,
      data: { challengeId, lifecycle: to },
    });
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      return res(409, { error: 'LIFECYCLE_CONFLICT', message: '다른 요청과 충돌했어요. 새로고침 후 다시 시도해주세요.' });
    }
    console.error('[advance-lifecycle] error:', err);
    return res(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
