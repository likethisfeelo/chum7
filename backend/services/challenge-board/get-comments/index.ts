import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { response, getUserId, isParticipant, decodeNextToken, encodeNextToken } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserId(event);
    const challengeId = event.pathParameters?.challengeId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다.' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });

    const participant = await isParticipant(client, challengeId, userId);
    if (!participant) {
      return response(403, { error: 'FORBIDDEN', message: '참여자만 댓글을 열람할 수 있습니다.' });
    }

    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20', 10), 50);
    let exclusiveStartKey;
    try {
      exclusiveStartKey = decodeNextToken(event.queryStringParameters?.nextToken);
    } catch {
      return response(400, { error: 'INVALID_NEXT_TOKEN' });
    }

    const result = await client.send(new QueryCommand({
      TableName: process.env.CHALLENGE_COMMENTS_TABLE!,
      IndexName: 'challengeId-createdAt-index',
      KeyConditionExpression: 'challengeId = :challengeId',
      ExpressionAttributeValues: { ':challengeId': challengeId },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }));

    return response(200, {
      comments: result.Items ?? [],
      nextToken: encodeNextToken(result.LastEvaluatedKey as Record<string, unknown> | undefined),
      hasMore: !!result.LastEvaluatedKey,
    });
  } catch (error) {
    console.error('get-comments error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
