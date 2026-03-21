// backend/services/cheer/get-my-cheers/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

type CheerRecord = {
  cheerId: string;
  cheerType?: string;
  message?: string | null;
  senderDelta?: number;
  senderAlias?: string | null;
  scheduledTime?: string | null;
  status?: string;
  isRead?: boolean;
  readAt?: string | null;
  isThanked?: boolean;
  thankedAt?: string | null;
  createdAt?: string;
  sentAt?: string | null;
  replyMessage?: string | null;
  repliedAt?: string | null;
  reactionType?: string | null;
  reactedAt?: string | null;
};

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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;

    if (!userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다'
      });
    }

    const params = event.queryStringParameters || {};
    const rawType = (params.type || 'received').trim().toLowerCase();
    const type = rawType === 'sent' ? 'sent' : 'received';

    const rawLimit = (params.limit || '20').trim();
    const parsedLimit = /^\d+$/.test(rawLimit) ? Number(rawLimit) : Number.NaN;
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(100, Math.max(1, parsedLimit))
      : 20;

    let result;

    if (type === 'received') {
      // 받은 응원 (sent + pending 모두 포함)
      // status='sent' 필터를 제거: 예약 응원(pending)도 수신자에게 표시해야 함.
      // 프론트에서 status 뱃지로 구분 처리.
      result = await docClient.send(new QueryCommand({
        TableName: process.env.CHEERS_TABLE!,
        IndexName: 'receiverId-index',
        KeyConditionExpression: 'receiverId = :receiverId',
        ExpressionAttributeValues: {
          ':receiverId': userId,
        },
        ScanIndexForward: false, // 최신순
      }));
    } else {
      // 보낸 응원 (filter 없으므로 Limit 그대로 사용 가능)
      result = await docClient.send(new QueryCommand({
        TableName: process.env.CHEERS_TABLE!,
        IndexName: 'senderId-index',
        KeyConditionExpression: 'senderId = :senderId',
        ExpressionAttributeValues: {
          ':senderId': userId
        },
        ScanIndexForward: false, // 최신순
        Limit: limit
      }));
    }

    const allItems = (result.Items || []) as CheerRecord[];
    // received는 애플리케이션 레이어에서 limit 적용
    const cheers = type === 'received' ? allItems.slice(0, limit) : allItems;

    // 받은 응원 조회 시 unread를 읽음 처리
    if (type === 'received') {
      const unreadCheers = cheers.filter((c) => !c.isRead);
      const readAt = new Date().toISOString();

      const readResults = await Promise.allSettled(unreadCheers.map((cheer) =>
        docClient.send(new UpdateCommand({
          TableName: process.env.CHEERS_TABLE!,
          Key: { cheerId: cheer.cheerId },
          UpdateExpression: 'SET isRead = :true, readAt = :readAt',
          ConditionExpression: 'attribute_exists(cheerId) AND receiverId = :receiverId AND (attribute_not_exists(isRead) OR isRead = :false)',
          ExpressionAttributeValues: {
            ':true': true,
            ':false': false,
            ':receiverId': userId,
            ':readAt': readAt
          }
        }))
      ));

      unreadCheers.forEach((cheer, index: number) => {
        if (readResults[index].status === 'fulfilled') {
          cheer.isRead = true;
          cheer.readAt = readAt;
          return;
        }

        const reason = (readResults[index] as PromiseRejectedResult).reason;
        if (reason?.name === 'ConditionalCheckFailedException') {
          // 동시 요청에서 이미 읽음 처리된 케이스는 성공으로 간주해 응답 일관성을 맞춥니다.
          cheer.isRead = true;
          cheer.readAt = cheer.readAt ?? readAt;

          console.info('Cheer already marked as read by concurrent request', {
            cheerId: cheer.cheerId
          });
          return;
        }

        console.warn('Failed to mark cheer as read', {
          cheerId: cheer.cheerId,
          reason
        });
      });
    }

    // 통계 계산
    const stats = {
      total: cheers.length,
      immediate: cheers.filter(c => c.cheerType === 'immediate').length,
      scheduled: cheers.filter(c => c.cheerType === 'scheduled').length,
      thanked: cheers.filter(c => c.isThanked).length,
      unread: cheers.filter(c => !c.isRead).length
    };

    return response(200, {
      success: true,
      data: {
        cheers: cheers.map(cheer => ({
          cheerId: cheer.cheerId,
          type: cheer.cheerType,
          message: cheer.message ?? null,
          senderAlias: cheer.senderAlias ?? null,
          delta: cheer.senderDelta ?? null,
          scheduledTime: cheer.scheduledTime ?? null,
          status: cheer.status,
          isRead: cheer.isRead,
          readAt: cheer.readAt ?? null,
          isThanked: cheer.isThanked ?? false,
          thankedAt: cheer.thankedAt ?? null,
          replyMessage: cheer.replyMessage ?? null,
          repliedAt: cheer.repliedAt ?? null,
          reactionType: cheer.reactionType ?? null,
          reactedAt: cheer.reactedAt ?? null,
          createdAt: cheer.createdAt,
          sentAt: cheer.sentAt ?? null,
        })),
        stats
      }
    });

  } catch (error: any) {
    console.error('Get my cheers error:', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
