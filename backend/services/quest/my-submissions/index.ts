/**
 * GET /quests/my-submissions?challengeId=xxx&questId=xxx&status=pending
 * 현재 유저의 퀘스트 제출 내역 조회
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

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
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub || event.queryStringParameters?.userId;
    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });

    const params = event.queryStringParameters || {};

    let submissions: any[] = [];

    const result = await docClient.send(new QueryCommand({
      TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: params.status ? '#status = :status' : undefined,
      ExpressionAttributeNames: params.status ? { '#status': 'status' } : undefined,
      ExpressionAttributeValues: {
        ':uid': userId,
        ...(params.status && { ':status': params.status }),
      },
      ScanIndexForward: false,
    }));
    submissions = result.Items ?? [];

    // challengeId 필터
    if (params.challengeId) {
      submissions = submissions.filter(s => s.challengeId === params.challengeId);
    }
    if (params.questId) {
      submissions = submissions.filter(s => s.questId === params.questId);
    }

    // 퀘스트 정보 enrichment
    const questIds = [...new Set(submissions.map(s => s.questId))];
    let questMap = new Map<string, any>();

    if (questIds.length > 0) {
      const batchResult = await docClient.send(new BatchGetCommand({
        RequestItems: {
          [process.env.QUESTS_TABLE!]: {
            Keys: questIds.map(id => ({ questId: id })),
          },
        },
      }));
      const quests = batchResult.Responses?.[process.env.QUESTS_TABLE!] ?? [];
      questMap = new Map(quests.map(q => [q.questId, q]));
    }

    const enriched = submissions.map(s => ({
      ...s,
      quest: questMap.get(s.questId) ?? null,
    }));

    return response(200, {
      success: true,
      data: { submissions: enriched, total: enriched.length },
    });

  } catch (error: any) {
    console.error('My quest submissions error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
