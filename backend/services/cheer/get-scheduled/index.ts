// backend/services/cheer/get-scheduled/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

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

function parseNextToken(nextToken?: string | null): Record<string, any> | undefined {
  if (!nextToken) return undefined;
  try {
    return JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'));
  } catch {
    throw new Error('INVALID_NEXT_TOKEN');
  }
}

function toNextToken(lastEvaluatedKey?: Record<string, any>) {
  if (!lastEvaluatedKey) return null;
  return Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf-8').toString('base64');
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

    const query = event.queryStringParameters || {};
    const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);

    let startKey: Record<string, any> | undefined;
    try {
      startKey = parseNextToken(query.nextToken);
    } catch {
      return response(400, {
        error: 'INVALID_NEXT_TOKEN',
        message: 'nextToken 형식이 올바르지 않습니다'
      });
    }

    // 내가 보낸 예약 응원 조회 (pending 상태만)
    const sentResult = await docClient.send(new QueryCommand({
      TableName: process.env.CHEERS_TABLE!,
      IndexName: 'senderId-index',
      KeyConditionExpression: 'senderId = :senderId',
      FilterExpression: 'cheerType = :scheduled AND #status = :pending',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':senderId': userId,
        ':scheduled': 'scheduled',
        ':pending': 'pending'
      },
      ScanIndexForward: true,
      Limit: limit,
      ExclusiveStartKey: startKey
    }));

    const scheduledCheers = sentResult.Items || [];

    const formatted = scheduledCheers.map((cheer: Record<string, any>) => {
      const scheduledDate = new Date(cheer.scheduledTime);
      const now = new Date();
      const diff = scheduledDate.getTime() - now.getTime();
      const minutesUntil = Math.max(0, Math.floor(diff / 60000));

      return {
        cheerId: cheer.cheerId,
        receiverId: cheer.receiverId,
        receiverIcon: '🐼', // TODO: 실제 아이콘 조회
        message: cheer.message,
        delta: cheer.senderDelta,
        scheduledTime: cheer.scheduledTime,
        scheduledTimeFormatted: scheduledDate.toLocaleString('ko-KR', {
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        minutesUntil,
        status: cheer.status
      };
    });

    return response(200, {
      success: true,
      data: {
        scheduled: formatted,
        total: formatted.length,
        nextToken: toNextToken(sentResult.LastEvaluatedKey as Record<string, any> | undefined)
      }
    });

  } catch (error: any) {
    console.error('Get scheduled cheers error:', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
