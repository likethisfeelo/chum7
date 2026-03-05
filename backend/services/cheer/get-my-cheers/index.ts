// backend/services/cheer/get-my-cheers/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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
    const rawType = params.type || 'received';
    const type = rawType === 'sent' ? 'sent' : 'received';

    const parsedLimit = Number.parseInt(params.limit || '20', 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(100, Math.max(1, parsedLimit))
      : 20;

    let result;

    if (type === 'received') {
      // 받은 응원
      result = await docClient.send(new QueryCommand({
        TableName: process.env.CHEERS_TABLE!,
        IndexName: 'receiverId-index',
        KeyConditionExpression: 'receiverId = :receiverId',
        ExpressionAttributeValues: {
          ':receiverId': userId
        },
        ScanIndexForward: false, // 최신순
        Limit: limit
      }));
    } else {
      // 보낸 응원
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

    const cheers = result.Items || [];

    // 받은 응원 조회 시 unread를 읽음 처리
    if (type === 'received') {
      const unreadCheers = cheers.filter((c: any) => !c.isRead);
      const readAt = new Date().toISOString();

      const readResults = await Promise.allSettled(unreadCheers.map((cheer: any) =>
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

      unreadCheers.forEach((cheer: any, index: number) => {
        if (readResults[index].status === 'fulfilled') {
          cheer.isRead = true;
          cheer.readAt = readAt;
          return;
        }

        const reason = (readResults[index] as PromiseRejectedResult).reason;
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
          message: cheer.message,
          delta: cheer.senderDelta,
          scheduledTime: cheer.scheduledTime,
          status: cheer.status,
          isRead: cheer.isRead,
          readAt: cheer.readAt ?? null,
          isThanked: cheer.isThanked,
          createdAt: cheer.createdAt,
          sentAt: cheer.sentAt
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