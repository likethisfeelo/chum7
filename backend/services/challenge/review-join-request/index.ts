import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const challengeId = event.pathParameters?.challengeId;
    const userChallengeId = event.pathParameters?.userChallengeId;

    if (!requesterId) return response(401, { error: 'UNAUTHORIZED' });
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
    if (challengeRes.Item.creatorId !== requesterId) return response(403, { error: 'FORBIDDEN' });

    const ucRes = await docClient.send(new GetCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Key: { userChallengeId },
    }));

    if (!ucRes.Item || ucRes.Item.challengeId !== challengeId) {
      return response(404, { error: 'JOIN_REQUEST_NOT_FOUND' });
    }

    if (ucRes.Item.status !== 'pending') {
      return response(409, { error: 'INVALID_STATUS', message: '대기중 요청만 심사할 수 있습니다.' });
    }

    const now = new Date().toISOString();

    if (decision === 'approve') {
      await docClient.send(new UpdateCommand({
        TableName: process.env.USER_CHALLENGES_TABLE!,
        Key: { userChallengeId },
        ConditionExpression: '#status = :pendingCurrent',
        UpdateExpression: 'SET #status = :active, joinStatus = :approved, paymentStatus = if_not_exists(paymentStatus, :free), approvedAt = :now, reviewedBy = :reviewedBy, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':pendingCurrent': 'pending',
          ':active': 'active',
          ':approved': 'approved',
          ':free': 'free',
          ':now': now,
          ':reviewedBy': requesterId,
        },
      }));

      await docClient.send(new UpdateCommand({
        TableName: process.env.CHALLENGES_TABLE!,
        Key: { challengeId },
        ConditionExpression: 'if_not_exists(stats.pendingParticipants, :zero) >= :inc',
        UpdateExpression: 'SET stats.pendingParticipants = if_not_exists(stats.pendingParticipants, :zero) - :inc, stats.activeParticipants = if_not_exists(stats.activeParticipants, :zero) + :inc, updatedAt = :now',
        ExpressionAttributeValues: { ':zero': 0, ':inc': 1, ':now': now },
      }));

      console.log(JSON.stringify({ type: 'kpi-event', name: 'challenge_join_approved', challengeId, userChallengeId, at: now }));
      return response(200, { success: true, decision: 'approve', reviewedAt: now });
    }

    await docClient.send(new UpdateCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Key: { userChallengeId },
      ConditionExpression: '#status = :pendingCurrent',
      UpdateExpression: 'SET #status = :failed, joinStatus = :rejected, paymentStatus = :refunded, refundStatus = :completed, rejectedAt = :now, reviewedBy = :reviewedBy, reviewReason = :reason, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':pendingCurrent': 'pending',
        ':failed': 'failed',
        ':rejected': 'rejected',
        ':refunded': 'refunded',
        ':completed': 'completed',
        ':now': now,
        ':reviewedBy': requesterId,
        ':reason': reason,
      },
    }));

    await docClient.send(new UpdateCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      ConditionExpression: 'if_not_exists(stats.pendingParticipants, :zero) >= :inc',
      UpdateExpression: 'SET stats.pendingParticipants = if_not_exists(stats.pendingParticipants, :zero) - :inc, updatedAt = :now',
      ExpressionAttributeValues: { ':zero': 0, ':inc': 1, ':now': now },
    }));

    console.log(JSON.stringify({ type: 'kpi-event', name: 'challenge_join_rejected_refunded', challengeId, userChallengeId, at: now }));

    return response(200, {
      success: true,
      decision: 'reject',
      reviewedAt: now,
      refund: {
        status: 'completed',
        reason: 'JOIN_REJECTED',
      },
    });
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return response(409, { error: 'ALREADY_REVIEWED_OR_INVALID_STATE' });
    }
    console.error('review-join-request error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
