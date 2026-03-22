/**
 * GET /admin/cheer/monitor
 *
 * 쿼리 파라미터:
 *   challengeId? — 특정 챌린지로 필터
 *   status?      — pending | sent | receiver_completed | failed (복수 허용: 콤마 구분)
 *   limit?       — 기본 50, 최대 200
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

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
    const qs = event.queryStringParameters || {};
    const challengeId = qs.challengeId || null;
    const statusFilter = qs.status ? qs.status.split(',').map((s) => s.trim()) : null;
    const limit = Math.min(Number(qs.limit || 50), 200);

    // ── 1. 응원 목록 조회 ──────────────────────────────────────────────
    let cheers: any[] = [];

    if (challengeId) {
      // challengeId-index로 특정 챌린지 응원 조회
      const result = await docClient.send(new QueryCommand({
        TableName: process.env.CHEERS_TABLE!,
        IndexName: 'challengeId-index',
        KeyConditionExpression: 'challengeId = :cid',
        ExpressionAttributeValues: { ':cid': challengeId },
        Limit: limit,
        ScanIndexForward: false,
      }));
      cheers = result.Items || [];
    } else {
      // 전체 스캔 (status별 최신 N건)
      // pending/sent/receiver_completed 각각 조회
      const statuses = statusFilter || ['pending', 'sent', 'receiver_completed'];
      for (const st of statuses) {
        const result = await docClient.send(new QueryCommand({
          TableName: process.env.CHEERS_TABLE!,
          IndexName: 'scheduled-index',
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': st },
          Limit: Math.ceil(limit / statuses.length),
          ScanIndexForward: false,
        }));
        cheers.push(...(result.Items || []));
      }
    }

    // status 필터 적용 (challengeId 조회 시)
    if (statusFilter && challengeId) {
      cheers = cheers.filter((c) => statusFilter.includes(c.status));
    }

    // limit 적용
    cheers = cheers.slice(0, limit);

    // ── 2. 챌린지별 유저 점수 조회 (challengeId 지정 시) ──────────────
    let userScores: any[] = [];
    if (challengeId) {
      const ucResult = await docClient.send(new QueryCommand({
        TableName: process.env.USER_CHALLENGES_TABLE!,
        IndexName: 'challengeId-index',
        KeyConditionExpression: 'challengeId = :cid',
        ExpressionAttributeValues: { ':cid': challengeId },
      }));
      userScores = (ucResult.Items || []).map((uc) => ({
        userChallengeId: uc.userChallengeId,
        userId: uc.userId,
        score: uc.score ?? 0,
        thankScore: uc.thankScore ?? 0,
        consecutiveDays: uc.consecutiveDays ?? 0,
        currentDay: uc.currentDay ?? 1,
        status: uc.status,
      }));
    }

    // ── 3. 집계 통계 ─────────────────────────────────────────────────
    const allCheersByStatus = cheers.reduce((acc: Record<string, number>, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {});

    const pendingCheers = cheers
      .filter((c) => c.status === 'pending')
      .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));

    const sentCheers = cheers
      .filter((c) => c.status === 'sent')
      .sort((a, b) => (b.sentAt || b.createdAt || '').localeCompare(a.sentAt || a.createdAt || ''));

    const receiverCompletedCheers = cheers
      .filter((c) => c.status === 'receiver_completed')
      .sort((a, b) => (b.thankScoreGrantedAt || '').localeCompare(a.thankScoreGrantedAt || ''));

    return response(200, {
      success: true,
      data: {
        summary: {
          total: cheers.length,
          byStatus: allCheersByStatus,
        },
        pending: pendingCheers.map((c) => ({
          cheerId: c.cheerId,
          senderId: c.senderId,
          receiverId: c.receiverId,
          challengeId: c.challengeId,
          senderAlias: c.senderAlias,
          senderDelta: c.senderDelta,
          day: c.day,
          scheduledTime: c.scheduledTime,
          createdAt: c.createdAt,
        })),
        sent: sentCheers.map((c) => ({
          cheerId: c.cheerId,
          senderId: c.senderId,
          receiverId: c.receiverId,
          challengeId: c.challengeId,
          senderAlias: c.senderAlias,
          senderDelta: c.senderDelta,
          day: c.day,
          sentAt: c.sentAt,
          isThankScoreGranted: c.isThankScoreGranted ?? false,
          isThanked: c.isThanked ?? false,
          reactionType: c.reactionType ?? null,
        })),
        receiverCompleted: receiverCompletedCheers.map((c) => ({
          cheerId: c.cheerId,
          senderId: c.senderId,
          receiverId: c.receiverId,
          challengeId: c.challengeId,
          senderAlias: c.senderAlias,
          senderDelta: c.senderDelta,
          day: c.day,
          thankScoreGrantedAt: c.thankScoreGrantedAt,
        })),
        userScores,
      },
    });
  } catch (error: any) {
    console.error('Admin cheer monitor error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
