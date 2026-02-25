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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;

    if (!userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다'
      });
    }

    // 1. 내가 보낸 예약 응원 조회 (pending 상태만)
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
      }
    }));

    const scheduledCheers = sentResult.Items || [];

    // 2. 발송 시간순으로 정렬
    scheduledCheers.sort((a, b) => 
      new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
    );

    // 3. 포맷팅
    const formatted = scheduledCheers.map(cheer => {
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
        total: formatted.length
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