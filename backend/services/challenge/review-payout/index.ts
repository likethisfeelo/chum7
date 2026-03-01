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
    const reviewerId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const groupsClaim = event.requestContext.authorizer?.jwt?.claims?.['cognito:groups'];
    const groups = parseGroups(groupsClaim);
    const isAdmin = groups.includes('admins');
    const challengeId = event.pathParameters?.challengeId;

    if (!reviewerId) return response(401, { error: 'UNAUTHORIZED' });
    if (!isAdmin) return response(403, { error: 'FORBIDDEN', message: '운영자 권한이 필요합니다.' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });

    const body = JSON.parse(event.body || '{}');
    const decision = body.decision as 'eligible' | 'withheld';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null;
    const reasonCode = typeof body.reasonCode === 'string' ? body.reasonCode.trim() : null;

    if (!['eligible', 'withheld'].includes(decision)) {
      return response(400, { error: 'VALIDATION_ERROR', message: 'decision은 eligible 또는 withheld 이어야 합니다.' });
    }
    if (decision === 'withheld' && (!reason || !reasonCode)) {
      return response(400, { error: 'VALIDATION_ERROR', message: 'withheld 시 reasonCode와 reason이 필요합니다.' });
    }

    if (reasonCode && !['LEADER_INACTIVE', 'POLICY_VIOLATION', 'COMPLAINT_CONFIRMED', 'OTHER'].includes(reasonCode)) {
      return response(400, { error: 'VALIDATION_ERROR', message: '유효하지 않은 reasonCode 입니다.' });
    }

    const challengeRes = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    if (!challengeRes.Item) return response(404, { error: 'CHALLENGE_NOT_FOUND' });

    if (challengeRes.Item.lifecycle !== 'completed' && challengeRes.Item.lifecycle !== 'archived') {
      return response(409, { error: 'PAYOUT_NOT_AVAILABLE', message: '챌린지 종료 후에만 정산 심사가 가능합니다.' });
    }

    const now = new Date().toISOString();

    await docClient.send(new UpdateCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      UpdateExpression: 'SET leaderPayoutStatus = :status, payoutWithholdReason = :reason, payoutWithholdReasonCode = :reasonCode, payoutReviewedBy = :reviewer, payoutDeterminedAt = :now, updatedAt = :now',
      ExpressionAttributeValues: {
        ':status': decision,
        ':reason': decision === 'withheld' ? reason : null,
        ':reasonCode': decision === 'withheld' ? reasonCode : null,
        ':reviewer': reviewerId,
        ':now': now,
      },
    }));

    if (process.env.PAYOUT_AUDIT_LOGS_TABLE) {
      await docClient.send(new PutCommand({
        TableName: process.env.PAYOUT_AUDIT_LOGS_TABLE,
        Item: {
          auditLogId: `${challengeId}#${now}#review`,
          challengeId,
          action: 'review',
          decision,
          reasonCode: decision === 'withheld' ? reasonCode : null,
          reason: decision === 'withheld' ? reason : null,
          actorId: reviewerId,
          createdAt: now,
        },
      }));
    }

    if (decision === 'withheld') {
      console.log(JSON.stringify({ type: 'kpi-event', name: 'leader_payout_withheld', challengeId, reviewerId, at: now }));
    }

    return response(200, {
      success: true,
      leaderPayoutStatus: decision,
      payoutWithholdReasonCode: decision === 'withheld' ? reasonCode : null,
      payoutWithholdReason: decision === 'withheld' ? reason : null,
      payoutDeterminedAt: now,
    });
  } catch (error) {
    console.error('review-payout error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
