/**
 * GET /admin/quests/submissions
 *   ?status=pending          (default: pending)
 *   ?questId=xxx             (특정 퀘스트 필터)
 *   ?limit=20
 *   ?nextToken=xxx           (pagination)
 *
 * status-createdAt-index 로 전체 pending 목록 조회.
 * questId 지정 시 questId-createdAt-index 사용.
 * 퀘스트 정보는 BatchGet으로 enrichment.
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

function isAdmin(event: APIGatewayProxyEvent): boolean {
  const groups = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  if (!groups) return false;
  if (typeof groups === 'string') return groups === 'admins';
  return Array.isArray(groups) && groups.includes('admins');
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdmin(event)) {
      return response(403, { error: 'FORBIDDEN', message: '관리자 권한이 필요합니다' });
    }

    const params   = event.queryStringParameters || {};
    const status   = params.status || 'pending';
    const questId  = params.questId;
    const limit    = Math.min(Number(params.limit) || 20, 100);
    const nextToken = params.nextToken
      ? JSON.parse(Buffer.from(params.nextToken, 'base64').toString())
      : undefined;

    // ── 제출물 조회 ────────────────────────────────────────────────────
    let submissions: any[] = [];
    let lastEvaluatedKey: any = undefined;

    if (questId) {
      // 특정 퀘스트의 모든 제출물 (questId-createdAt-index)
      const result = await docClient.send(new QueryCommand({
        TableName:  process.env.QUEST_SUBMISSIONS_TABLE!,
        IndexName:  'questId-createdAt-index',
        KeyConditionExpression: 'questId = :qid',
        FilterExpression:       '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':qid': questId, ':status': status },
        ScanIndexForward: false,
        Limit:      limit,
        ExclusiveStartKey: nextToken,
      }));
      submissions      = result.Items ?? [];
      lastEvaluatedKey = result.LastEvaluatedKey;
    } else {
      // 전체 status별 목록 (status-createdAt-index)
      const result = await docClient.send(new QueryCommand({
        TableName:  process.env.QUEST_SUBMISSIONS_TABLE!,
        IndexName:  'status-createdAt-index',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ScanIndexForward: false, // 최신순
        Limit:      limit,
        ExclusiveStartKey: nextToken,
      }));
      submissions      = result.Items ?? [];
      lastEvaluatedKey = result.LastEvaluatedKey;
    }

    // ── 퀘스트 정보 BatchGet enrichment ───────────────────────────────
    const questIds = [...new Set(submissions.map(s => s.questId))];
    let questMap   = new Map<string, any>();

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
      data: {
        submissions: enriched,
        total:       enriched.length,
        nextToken:   lastEvaluatedKey
          ? Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64')
          : null,
      },
    });

  } catch (error: any) {
    console.error('Admin list quest submissions error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
