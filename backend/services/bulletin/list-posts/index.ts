/**
 * GET /bulletin/{challengeId}/posts?phase=preparing&limit=20&nextToken=xxx
 *
 * 게시판 피드 조회 (최신순 페이지네이션).
 * challengePhaseKey = `${challengeId}#${phase}` GSI 사용.
 *
 * nextToken: LastEvaluatedKey를 base64 인코딩한 커서
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
    const challengeId = event.pathParameters?.challengeId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });

    const params = event.queryStringParameters || {};
    const phase = (params.phase as 'preparing' | 'active') ?? 'preparing';
    const limit = Math.min(parseInt(params.limit ?? '20', 10), 50);
    const nextToken = params.nextToken;

    const challengePhaseKey = `${challengeId}#${phase}`;

    let exclusiveStartKey: any = undefined;
    if (nextToken) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString('utf8'));
      } catch {
        return response(400, { error: 'INVALID_NEXT_TOKEN' });
      }
    }

    const result = await docClient.send(new QueryCommand({
      TableName: process.env.BULLETIN_POSTS_TABLE!,
      IndexName: 'challengePhaseKey-index',
      KeyConditionExpression: 'challengePhaseKey = :key',
      FilterExpression: 'isDeleted = :false',
      ExpressionAttributeValues: {
        ':key': challengePhaseKey,
        ':false': false,
      },
      ScanIndexForward: false, // 최신순
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }));

    const posts = result.Items ?? [];
    const newNextToken = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : null;

    return response(200, {
      success: true,
      data: {
        posts,
        total: posts.length,
        nextToken: newNextToken,
        hasMore: !!newNextToken,
        phase,
      },
    });

  } catch (error: any) {
    console.error('List bulletin posts error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
