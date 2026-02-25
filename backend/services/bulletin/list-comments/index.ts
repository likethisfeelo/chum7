/**
 * GET /bulletin/{challengeId}/posts/{postId}/comments?limit=30&nextToken=xxx
 * 게시글의 댓글 목록 조회 (오래된 순).
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const postId = event.pathParameters?.postId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    if (!postId) return response(400, { error: 'MISSING_POST_ID' });

    const params = event.queryStringParameters || {};
    const limit = Math.min(parseInt(params.limit ?? '30', 10), 100);

    let exclusiveStartKey: any = undefined;
    if (params.nextToken) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(params.nextToken, 'base64').toString('utf8'));
      } catch {
        return response(400, { error: 'INVALID_NEXT_TOKEN' });
      }
    }

    const result = await docClient.send(new QueryCommand({
      TableName: process.env.BULLETIN_COMMENTS_TABLE!,
      IndexName: 'postId-index',
      KeyConditionExpression: 'postId = :pid',
      FilterExpression: 'isDeleted = :false',
      ExpressionAttributeValues: { ':pid': postId, ':false': false },
      ScanIndexForward: true, // 오래된 순
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }));

    const comments = result.Items ?? [];
    const newNextToken = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : null;

    return response(200, {
      success: true,
      data: {
        comments,
        total: comments.length,
        nextToken: newNextToken,
        hasMore: !!newNextToken,
      },
    });

  } catch (error: any) {
    console.error('List bulletin comments error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
