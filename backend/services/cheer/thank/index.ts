// backend/services/cheer/thank/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({});

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

// 발신자에게 감사 알림 발송
async function sendThankNotification(senderId: string, receiverIcon: string): Promise<void> {
  try {
    await snsClient.send(new PublishCommand({
      TopicArn: process.env.SNS_TOPIC_ARN!,
      Message: JSON.stringify({
        userId: senderId,
        notification: {
          title: '당신의 응원이 힘이 됐어요! ❤️',
          body: `${receiverIcon}님이 당신의 응원에 감사를 표했어요!`,
          data: {
            type: 'cheer_thanked',
            timestamp: new Date().toISOString()
          }
        }
      })
    }));
  } catch (error) {
    console.error('Thank notification error:', error);
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const body = event.body ? JSON.parse(event.body) : {};
    const cheerId = event.pathParameters?.cheerId || body?.cheerId;

    if (!userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다'
      });
    }

    if (!cheerId) {
      return response(400, {
        error: 'MISSING_CHEER_ID',
        message: '응원 ID가 필요합니다'
      });
    }

    // 1. 응원 조회
    const cheerResult = await docClient.send(new GetCommand({
      TableName: process.env.CHEERS_TABLE!,
      Key: { cheerId }
    }));

    if (!cheerResult.Item) {
      return response(404, {
        error: 'CHEER_NOT_FOUND',
        message: '응원을 찾을 수 없습니다'
      });
    }

    const cheer = cheerResult.Item;

    // 2. 권한 확인 (수신자만 감사 가능)
    if (cheer.receiverId !== userId) {
      return response(403, {
        error: 'FORBIDDEN',
        message: '본인이 받은 응원에만 감사를 표할 수 있습니다'
      });
    }

    // 3. 이미 감사했는지 확인
    if (cheer.isThanked) {
      return response(409, {
        error: 'ALREADY_THANKED',
        message: '이미 감사를 표한 응원입니다'
      });
    }

    // 4. 감사 상태 업데이트
    const now = new Date().toISOString();

    await docClient.send(new UpdateCommand({
      TableName: process.env.CHEERS_TABLE!,
      Key: { cheerId },
      UpdateExpression: 'SET isThanked = :true, thankedAt = :now',
      ExpressionAttributeValues: {
        ':true': true,
        ':now': now
      }
    }));

    // 5. 발신자에게 알림 발송
    await sendThankNotification(cheer.senderId, '🐰'); // TODO: 실제 아이콘

    return response(200, {
      success: true,
      message: '감사를 전달했어요!'
    });

  } catch (error: any) {
    console.error('Thank cheer error:', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};