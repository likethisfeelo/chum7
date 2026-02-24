/**
 * GET /quests?challengeId=xxx&status=active
 * GET /quests?status=active  (챌린지 독립 퀘스트 포함 전체)
 *
 * 퀘스트 목록 조회. 각 퀘스트에 현재 유저의 제출 현황도 포함.
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

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
    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const params = event.queryStringParameters || {};
    const challengeId = params.challengeId;
    const statusFilter = params.status || 'active';
    const now = new Date().toISOString();

    let quests: any[] = [];

    if (challengeId) {
      // 특정 챌린지의 퀘스트 목록
      const result = await docClient.send(new QueryCommand({
        TableName: process.env.QUESTS_TABLE!,
        IndexName: 'challengeId-index',
        KeyConditionExpression: 'challengeId = :cid',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':cid': challengeId, ':status': statusFilter },
      }));
      quests = result.Items ?? [];
    } else {
      // 전체 active 퀘스트 (status-index)
      const result = await docClient.send(new QueryCommand({
        TableName: process.env.QUESTS_TABLE!,
        IndexName: 'status-index',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': statusFilter },
      }));
      quests = result.Items ?? [];
    }

    // 기간 만료된 퀘스트 필터링
    quests = quests.filter(q => !q.endAt || q.endAt >= now);
    // displayOrder 기준 정렬
    quests.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

    // 현재 유저의 제출 현황 조회
    const userSubmissionsResult = await docClient.send(new QueryCommand({
      TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }));
    const userSubmissions = userSubmissionsResult.Items ?? [];
    const submissionMap = new Map<string, any>();
    for (const sub of userSubmissions) {
      // 최신 제출 상태만 유지
      if (!submissionMap.has(sub.questId) || sub.createdAt > submissionMap.get(sub.questId).createdAt) {
        submissionMap.set(sub.questId, sub);
      }
    }

    const enrichedQuests = quests.map(q => ({
      ...q,
      mySubmission: submissionMap.get(q.questId) ?? null,
    }));

    return response(200, {
      success: true,
      data: { quests: enrichedQuests, total: enrichedQuests.length },
    });

  } catch (error: any) {
    console.error('List quests error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
