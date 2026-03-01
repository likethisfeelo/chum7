import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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
  if (Array.isArray(rawGroups)) return rawGroups.map(String);
  if (typeof rawGroups !== 'string') return [];
  const value = rawGroups.trim();
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {}
  return value.split(',').map(v => v.trim()).filter(Boolean);
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const groupsClaim = event.requestContext.authorizer?.jwt?.claims?.['cognito:groups'];
    const groups = parseGroups(groupsClaim);
    const isAdmin = groups.includes('admins');
    const challengeId = event.pathParameters?.challengeId;

    if (!requesterId) return response(401, { error: 'UNAUTHORIZED' });
    if (!isAdmin) return response(403, { error: 'FORBIDDEN', message: '운영자 권한이 필요합니다.' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });

    const challengeRes = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    const challenge = challengeRes.Item;
    if (!challenge) return response(404, { error: 'CHALLENGE_NOT_FOUND' });

    if (challenge.lifecycle !== 'completed' && challenge.lifecycle !== 'archived') {
      return response(409, { error: 'PAYOUT_NOT_AVAILABLE', message: '챌린지 종료 후에만 정산 가능합니다.' });
    }

    const payoutStatus = challenge.leaderPayoutStatus ?? 'eligible';
    if (payoutStatus === 'withheld') {
      return response(409, { error: 'PAYOUT_WITHHELD', message: '정산 제외 상태입니다.' });
    }

    const now = new Date().toISOString();
    const payoutAmount = Number(challenge.leaderPayoutAmount ?? 0);

    if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
      return response(409, { error: 'INVALID_PAYOUT_AMOUNT', message: '정산 금액이 설정되어야 정산 확정이 가능합니다.' });
    }

    await docClient.send(new UpdateCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      UpdateExpression: 'SET leaderPayoutStatus = :paid, payoutFinalizedAt = :now, payoutFinalizedBy = :admin, updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(payoutFinalizedAt) AND (leaderPayoutStatus = :eligible OR attribute_not_exists(leaderPayoutStatus))',
      ExpressionAttributeValues: {
        ':paid': 'paid',
        ':now': now,
        ':admin': requesterId,
        ':eligible': 'eligible',
      },
    }));

    if (process.env.PAYOUT_AUDIT_LOGS_TABLE) {
      await docClient.send(new PutCommand({
        TableName: process.env.PAYOUT_AUDIT_LOGS_TABLE,
        Item: {
          auditLogId: `${challengeId}#${now}#finalize`,
          challengeId,
          action: 'finalize',
          decision: 'paid',
          payoutAmount,
          actorId: requesterId,
          createdAt: now,
        },
      }));
    }

    return response(200, {
      success: true,
      leaderPayoutStatus: 'paid',
      leaderPayoutAmount: payoutAmount,
      payoutFinalizedAt: now,
    });
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return response(409, { error: 'PAYOUT_NOT_ELIGIBLE_OR_ALREADY_FINALIZED' });
    }
    console.error('finalize-payout error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
