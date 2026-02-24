/**
 * GET /quests/my-submissions
 *   ?questId=xxx          (특정 퀘스트 이력만)
 *   &challengeId=xxx      (챌린지 연결 제출만)
 *   &status=pending       (상태 필터)
 *   &includeHistory=true  (재제출 체인 포함)
 *
 * 두 가지 모드:
 *   includeHistory=false (기본): activeQuestSubmissions 기준 → 현재 유효한 제출만
 *   includeHistory=true        : questSubmissions 기준     → 전체 시도 이력 포함
 *
 * questId 지정 시: 해당 퀘스트의 모든 시도를 attemptNumber 오름차순으로 반환
 *   → 재제출 체인 확인 UI에 사용
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';

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

    const params         = event.queryStringParameters || {};
    const questId        = params.questId;
    const challengeId    = params.challengeId;
    const statusFilter   = params.status;
    const includeHistory = params.includeHistory === 'true';

    let submissions: any[] = [];

    if (includeHistory) {
      // ── 이력 모드: questSubmissions 테이블 (전체 시도) ─────────────
      const result = await docClient.send(new QueryCommand({
        TableName:  process.env.QUEST_SUBMISSIONS_TABLE!,
        IndexName:  'userId-createdAt-index',
        KeyConditionExpression: 'userId = :uid',
        FilterExpression: [
          questId     ? 'questId = :qid'       : null,
          challengeId ? 'challengeId = :cid'   : null,
          statusFilter ? '#status = :status'   : null,
        ].filter(Boolean).join(' AND ') || undefined,
        ExpressionAttributeNames: statusFilter ? { '#status': 'status' } : undefined,
        ExpressionAttributeValues: {
          ':uid': userId,
          ...(questId     && { ':qid': questId }),
          ...(challengeId && { ':cid': challengeId }),
          ...(statusFilter && { ':status': statusFilter }),
        },
        ScanIndexForward: false,
      }));
      submissions = result.Items ?? [];

      // questId 지정 시 attemptNumber 오름차순 정렬 (재제출 체인 보기)
      if (questId) {
        submissions.sort((a, b) => (a.attemptNumber ?? 1) - (b.attemptNumber ?? 1));
      }

    } else {
      // ── 현재 상태 모드: activeQuestSubmissions (유효한 제출만) ──────
      if (questId) {
        // 특정 퀘스트의 현재 제출 상태
        const activeResult = await docClient.send(new GetCommand({
          TableName: process.env.ACTIVE_QUEST_SUBMISSIONS_TABLE!,
          Key: { activeSubmissionId: `${userId}#${questId}` },
        }));
        if (activeResult.Item) {
          // submissionId로 전체 정보 조회
          const subResult = await docClient.send(new GetCommand({
            TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
            Key: { submissionId: activeResult.Item.submissionId },
          }));
          submissions = subResult.Item ? [subResult.Item] : [];
        }
      } else {
        // 전체 현재 제출 목록: questSubmissions에서 userId 기준 조회 후 active만 필터
        // (activeQuestSubmissions는 questId별로만 조회 가능 → userId scan 없음)
        // 따라서 questSubmissions userId-createdAt-index 사용, status != rejected 필터
        const result = await docClient.send(new QueryCommand({
          TableName:  process.env.QUEST_SUBMISSIONS_TABLE!,
          IndexName:  'userId-createdAt-index',
          KeyConditionExpression: 'userId = :uid',
          FilterExpression: [
            '#status <> :rejected',
            challengeId ? 'challengeId = :cid' : null,
            statusFilter ? '#status = :status'  : null,
          ].filter(Boolean).join(' AND '),
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':uid':      userId,
            ':rejected': 'rejected',
            ...(challengeId  && { ':cid': challengeId }),
            ...(statusFilter && { ':status': statusFilter }),
          },
          ScanIndexForward: false,
        }));
        submissions = result.Items ?? [];

        // 동일 questId의 최신 제출만 유지 (재제출로 인한 중복 제거)
        const deduped = new Map<string, any>();
        for (const sub of submissions) {
          const existing = deduped.get(sub.questId);
          if (!existing || sub.createdAt > existing.createdAt) {
            deduped.set(sub.questId, sub);
          }
        }
        submissions = Array.from(deduped.values());
      }
    }

    // ── 퀘스트 정보 enrichment (BatchGet) ─────────────────────────────
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
        mode:        includeHistory ? 'history' : 'current',
      },
    });

  } catch (error: any) {
    console.error('My quest submissions error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
