// backend/services/cheer/get-targets/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { calculateEffectiveCurrentDay, resolveDurationDays } from '../../../shared/lib/challenge-day-sync';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify(body)
  };
}

// 목표 시간에서 델타를 뺀 예상 발송 시간 계산
function calculatePredictedTime(targetTime: string, delta: number): string {
  const target = new Date(targetTime);
  target.setMinutes(target.getMinutes() - delta);
  return target.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;

    if (!userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다'
      });
    }

    // 1. 사용자의 활성 챌린지 조회
    const userChallengesResult = await docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':status': 'active'
      }
    }));

    const userChallenges = userChallengesResult.Items || [];

    if (userChallenges.length === 0) {
      return response(200, {
        success: true,
        data: {
          immediateTargets: [],
          schedulableTargets: [],
          myTickets: 0,
          myDelta: 0,
          availableTickets: []
        }
      });
    }

    // 2. 사용자의 응원권 개수 조회
    const ticketsResult = await docClient.send(new QueryCommand({
      TableName: process.env.USER_CHEER_TICKETS_TABLE!,
      IndexName: 'userId-status-index',
      KeyConditionExpression: 'userId = :userId AND #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':status': 'available'
      }
    }));

    const availableTickets = (ticketsResult.Items || []).map((ticket: any) => ({
      ticketId: ticket.ticketId,
      challengeId: ticket.challengeId,
      delta: ticket.delta,
      expiresAt: ticket.expiresAt
    }));
    const myTickets = availableTickets.length;
    const myDelta = availableTickets[0]?.delta || 0; // 가장 최근 티켓의 델타

    // 3. 같은 그룹의 다른 사용자 조회
    const immediateTargets: any[] = [];
    const schedulableTargets: any[] = [];
    const nowIso = new Date().toISOString();
    const challengeCache = new Map<string, any>();
    const userIconCache = new Map<string, string>();
    const processedGroupIds = new Set<string>();
    const seenImmediateTargetKeys = new Set<string>();

    for (const uc of userChallenges) {
      const groupId = typeof uc.groupId === 'string' ? uc.groupId : '';
      if (!groupId || processedGroupIds.has(groupId)) continue;
      processedGroupIds.add(groupId);

      // 같은 그룹 멤버 조회
      const groupResult = await docClient.send(new QueryCommand({
        TableName: process.env.USER_CHALLENGES_TABLE!,
        IndexName: 'groupId-index',
        KeyConditionExpression: 'groupId = :groupId',
        ExpressionAttributeValues: {
          ':groupId': groupId
        }
      }));

      const groupMembers = groupResult.Items || [];

      const memberUserIds = [...new Set(groupMembers
        .map((member: any) => typeof member.userId === 'string' ? member.userId : '')
        .filter((id: string) => !!id))];

      const uncachedUserIds = memberUserIds.filter((id) => !userIconCache.has(id));
      if (uncachedUserIds.length > 0) {
        const usersResult = await docClient.send(new BatchGetCommand({
          RequestItems: {
            [process.env.USERS_TABLE!]: {
              Keys: uncachedUserIds.map((id) => ({ userId: id })),
            }
          }
        }));

        const users = usersResult.Responses?.[process.env.USERS_TABLE!] || [];
        const iconByUserId = new Map(users.map((u: any) => [u.userId, typeof u.animalIcon === 'string' ? u.animalIcon : '🐰']));
        for (const uid of uncachedUserIds) {
          userIconCache.set(uid, iconByUserId.get(uid) || '🐰');
        }
      }

      for (const member of groupMembers) {
        // 본인/비활성 제외
        if (member.userId === userId || member.status !== 'active') continue;

        const challengeId = typeof member.challengeId === 'string' ? member.challengeId : '';
        if (!challengeId) continue;

        let challenge = challengeCache.get(challengeId);
        if (challenge === undefined) {
          const challengeResult = await docClient.send(new GetCommand({
            TableName: process.env.CHALLENGES_TABLE!,
            Key: { challengeId }
          }));
          challenge = challengeResult.Item || null;
          challengeCache.set(challengeId, challenge);
        }

        const durationDays = resolveDurationDays(challenge?.durationDays, member.progress);
        const currentDay = calculateEffectiveCurrentDay(member, nowIso, durationDays);

        // 현재 Day의 인증 상태 확인
        const progress = Array.isArray(member.progress) ? member.progress : Object.values(member.progress || {});
        const todayProgress = progress.find((p: any) => Number(p?.day) === currentDay);

        // 미완료자
        if (!todayProgress || todayProgress.status !== 'success') {
          const target = {
            userId: member.userId,
            challengeId,
            animalIcon: userIconCache.get(member.userId) || '🐰',
            challengeTitle: challenge?.title || 'Unknown',
            currentDay,
            targetTime: challenge?.targetTime || '07:00',
            status: 'in_progress'
          };

          const targetKey = `${target.challengeId}:${target.userId}:${target.currentDay}`;
          if (seenImmediateTargetKeys.has(targetKey)) {
            continue;
          }
          seenImmediateTargetKeys.add(targetKey);

          // 즉시 응원 가능 대상
          immediateTargets.push(target);

          // 예약 응원 가능 대상 (델타가 있는 경우)
          if (myDelta > 0 && challenge?.targetTime) {
            schedulableTargets.push({
              ...target,
              predictedScheduledTime: calculatePredictedTime(
                `2024-01-01T${challenge.targetTime}:00Z`,
                myDelta
              )
            });
          }
        }
      }
    }

    return response(200, {
      success: true,
      data: {
        immediateTargets: immediateTargets.slice(0, 10), // 최대 10명
        schedulableTargets: schedulableTargets.slice(0, 10),
        myTickets,
        myDelta,
        availableTickets
      }
    });

  } catch (error: any) {
    console.error('Get cheer targets error:', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
