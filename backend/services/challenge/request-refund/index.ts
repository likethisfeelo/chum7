import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const challengeId = event.pathParameters?.challengeId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });

    const challengeRes = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    if (!challengeRes.Item) return response(404, { error: 'CHALLENGE_NOT_FOUND' });

    const startAt = challengeRes.Item.challengeStartAt ? new Date(challengeRes.Item.challengeStartAt) : null;
    const nowDate = new Date();

    if (startAt && startAt.getTime() <= nowDate.getTime()) {
      console.log(JSON.stringify({ type: 'kpi-event', name: 'challenge_refund_blocked_after_start', challengeId, actorUserId: userId, at: nowDate.toISOString() }));
      return response(409, {
        error: 'REFUND_BLOCKED_AFTER_START',
        message: '챌린지 시작 이후에는 환불할 수 없습니다.',
      });
    }

    const ucQuery = await docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'challengeId = :cid AND (#status = :active OR #status = :pending)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':uid': userId,
        ':cid': challengeId,
        ':active': 'active',
        ':pending': 'pending',
      },
      Limit: 1,
    }));

    const userChallenge = ucQuery.Items?.[0];
    if (!userChallenge) return response(404, { error: 'PARTICIPATION_NOT_FOUND' });

    const now = new Date().toISOString();

    await docClient.send(new UpdateCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Key: { userChallengeId: userChallenge.userChallengeId },
      UpdateExpression: 'SET refundStatus = :requested, paymentStatus = :refundRequested, refundRequestedAt = :now, updatedAt = :now',
      ExpressionAttributeValues: {
        ':requested': 'requested',
        ':refundRequested': 'refund_requested',
        ':now': now,
      },
    }));

    console.log(JSON.stringify({ type: 'kpi-event', name: 'challenge_refund_requested', challengeId, actorUserId: userId, at: now }));

    return response(200, {
      success: true,
      refundStatus: 'requested',
      message: '환불 요청이 접수되었습니다. 검토 후 처리됩니다.',
    });
  } catch (error) {
    console.error('request-refund error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
