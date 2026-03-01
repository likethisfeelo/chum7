import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
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
    const userChallengeId = event.pathParameters?.userChallengeId;

    if (!reviewerId) return response(401, { error: 'UNAUTHORIZED' });
    if (!isAdmin) return response(403, { error: 'FORBIDDEN', message: '운영자 권한이 필요합니다.' });
    if (!challengeId || !userChallengeId) return response(400, { error: 'MISSING_PATH_PARAMS' });

    const body = JSON.parse(event.body || '{}');
    const decision = body.decision as 'approve' | 'reject';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null;

    if (!['approve', 'reject'].includes(decision)) {
      return response(400, { error: 'VALIDATION_ERROR', message: 'decision은 approve 또는 reject만 허용됩니다.' });
    }

    const challengeRes = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));
    if (!challengeRes.Item) return response(404, { error: 'CHALLENGE_NOT_FOUND' });

    const userChallengeRes = await docClient.send(new GetCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Key: { userChallengeId },
    }));

    const userChallenge = userChallengeRes.Item;
    if (!userChallenge || userChallenge.challengeId !== challengeId) {
      return response(404, { error: 'PARTICIPATION_NOT_FOUND' });
    }

    const now = new Date().toISOString();

    if (decision === 'approve') {
      await docClient.send(new UpdateCommand({
        TableName: process.env.USER_CHALLENGES_TABLE!,
        Key: { userChallengeId },
        ConditionExpression: 'refundStatus = :requested',
        UpdateExpression: 'SET refundStatus = :completed, paymentStatus = :refunded, #status = :failed, joinStatus = :refunded, refundReviewedBy = :reviewer, refundReviewedAt = :now, refundReviewDecision = :decision, refundReviewReason = :reason, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':requested': 'requested',
          ':completed': 'completed',
          ':refunded': 'refunded',
          ':failed': 'failed',
          ':reviewer': reviewerId,
          ':now': now,
          ':decision': 'approve',
          ':reason': reason,
        },
      }));

      if (userChallenge.status === 'active' || userChallenge.status === 'pending') {
        const counterField = userChallenge.status === 'active' ? 'activeParticipants' : 'pendingParticipants';
        await docClient.send(new UpdateCommand({
          TableName: process.env.CHALLENGES_TABLE!,
          Key: { challengeId },
          ConditionExpression: `if_not_exists(stats.${counterField}, :zero) >= :inc`,
          UpdateExpression: `SET stats.${counterField} = if_not_exists(stats.${counterField}, :zero) - :inc, updatedAt = :now`,
          ExpressionAttributeValues: {
            ':zero': 0,
            ':inc': 1,
            ':now': now,
          },
        }));
      }

      return response(200, {
        success: true,
        decision: 'approve',
        refundStatus: 'completed',
        reviewedAt: now,
      });
    }

    await docClient.send(new UpdateCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Key: { userChallengeId },
      ConditionExpression: 'refundStatus = :requested',
      UpdateExpression: 'SET refundStatus = :rejected, refundReviewedBy = :reviewer, refundReviewedAt = :now, refundReviewDecision = :decision, refundReviewReason = :reason, updatedAt = :now',
      ExpressionAttributeValues: {
        ':requested': 'requested',
        ':rejected': 'rejected',
        ':reviewer': reviewerId,
        ':now': now,
        ':decision': 'reject',
        ':reason': reason,
      },
    }));

    return response(200, {
      success: true,
      decision: 'reject',
      refundStatus: 'rejected',
      reviewedAt: now,
    });
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return response(409, { error: 'REFUND_REVIEW_CONFLICT', message: '요청된 환불 건만 심사할 수 있습니다.' });
    }
    console.error('review-refund error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
