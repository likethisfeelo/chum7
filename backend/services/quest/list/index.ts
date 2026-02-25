/**
 * GET /quests?challengeId=xxx&status=active
 * GET /quests?status=active  (챌린지 독립 퀘스트 포함 전체)
 *
 * 퀘스트 목록 + 현재 유저의 제출 현황 포함.
 *
 * 현재 유저 상태 조회 방법:
 *   activeQuestSubmissions BatchGetItem (PK: `${userId}#${questId}`)
 *   → 목록 크기만큼 O(n) GetItem (유저 전체 스캔 대신)
 *   → BatchGetCommand로 한 번에 처리
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
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const params       = event.queryStringParameters || {};
    const challengeId  = params.challengeId;
    const statusFilter = params.status || 'active';
    const now          = new Date().toISOString();

    // ── 1. 퀘스트 목록 조회 ───────────────────────────────────────────
    let quests: any[] = [];

    if (challengeId) {
      const result = await docClient.send(new QueryCommand({
        TableName:     process.env.QUESTS_TABLE!,
        IndexName:     'challengeId-index',
        KeyConditionExpression:   'challengeId = :cid',
        FilterExpression:         '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':cid': challengeId, ':status': statusFilter },
      }));
      quests = result.Items ?? [];
    } else {
      const result = await docClient.send(new QueryCommand({
        TableName:     process.env.QUESTS_TABLE!,
        IndexName:     'status-index',
        KeyConditionExpression:   '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': statusFilter },
      }));
      quests = result.Items ?? [];
    }

    // 기간 만료 필터 + displayOrder 정렬
    quests = quests
      .filter(q => !q.endAt || q.endAt >= now)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

    if (quests.length === 0) {
      return response(200, { success: true, data: { quests: [], total: 0 } });
    }

    // ── 2. activeQuestSubmissions BatchGet으로 현재 제출 상태 조회 ────
    // PK = `${userId}#${questId}` 목록을 한 번에 배치 조회
    const activeKeys = quests.map(q => ({
      activeSubmissionId: `${userId}#${q.questId}`,
    }));

    const batchResult = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [process.env.ACTIVE_QUEST_SUBMISSIONS_TABLE!]: {
          Keys: activeKeys,
          // submissionId, status만 가져오면 충분
          ProjectionExpression: 'activeSubmissionId, submissionId, #s, updatedAt',
          ExpressionAttributeNames: { '#s': 'status' },
        },
      },
    }));

    const activeItems = batchResult.Responses?.[process.env.ACTIVE_QUEST_SUBMISSIONS_TABLE!] ?? [];
    const activeMap   = new Map(activeItems.map(item => [item.activeSubmissionId, item]));

    // ── 3. 퀘스트 + 제출 현황 결합 ───────────────────────────────────
    const enrichedQuests = quests.map(q => {
      const activeSubmissionId = `${userId}#${q.questId}`;
      const activeSubmission   = activeMap.get(activeSubmissionId) ?? null;

      return {
        ...q,
        mySubmission: activeSubmission
          ? {
              submissionId: activeSubmission.submissionId,
              status:       activeSubmission.status,
              updatedAt:    activeSubmission.updatedAt,
            }
          : null,
      };
    });

    return response(200, {
      success: true,
      data: { quests: enrichedQuests, total: enrichedQuests.length },
    });

  } catch (error: any) {
    console.error('List quests error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
