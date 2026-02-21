// backend/services/cheer/send-immediate/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({});

// 입력 검증 스키마
const sendImmediateSchema = z.object({
  receiverIds: z.array(z.string().uuid()).min(1).max(50),
  message: z.string().min(1).max(200),
  senderDelta: z.number().min(0)
});

type SendImmediateInput = z.infer<typeof sendImmediateSchema>;

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

// 푸시 알림 발송
async function sendPushNotification(
  userId: string,
  message: string,
  senderIcon: string
): Promise<void> {
  try {
    await snsClient.send(new PublishCommand({
      TopicArn: process.env.SNS_TOPIC_ARN!,
      Message: JSON.stringify({
        userId,
        notification: {
          title: '응원이 도착했어요! 💪',
          body: `${senderIcon} ${message}`,
          data: {
            type: 'cheer_received',
            timestamp: new Date().toISOString()
          }
        }
      })
    }));
  } catch (error) {
    console.error('Push notification error:', error);
    // 푸시 실패는 무시 (non-critical)
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // 1. 입력 검증
    const body = JSON.parse(event.body || '{}');
    const input: SendImmediateInput = sendImmediateSchema.parse(body);

    // 2. 발신자 정보 (실제로는 Cognito Authorizer에서)
    const senderId = body.senderId; // 임시
    const senderIcon = body.senderIcon || '🐰'; // 임시

    // 3. 각 수신자에게 응원 저장 및 알림 발송
    const now = new Date().toISOString();
    const cheerIds: string[] = [];

    for (const receiverId of input.receiverIds) {
      const cheerId = uuidv4();
      
      // Cheers 테이블에 저장
      const cheer = {
        cheerId,
        senderId,
        receiverId,
        verificationId: null,
        cheerType: 'immediate',
        message: input.message,
        senderDelta: input.senderDelta,
        scheduledTime: null,
        status: 'sent',
        isRead: false,
        isThanked: false,
        thankedAt: null,
        createdAt: now,
        sentAt: now
      };

      await docClient.send(new PutCommand({
        TableName: process.env.CHEERS_TABLE!,
        Item: cheer
      }));

      cheerIds.push(cheerId);

      // 푸시 알림 발송
      await sendPushNotification(receiverId, input.message, senderIcon);
    }

    // 4. 응답
    return response(200, {
      success: true,
      message: `${input.receiverIds.length}명에게 응원을 보냈어요!`,
      data: {
        cheersSent: input.receiverIds.length,
        cheerIds
      }
    });

  } catch (error: any) {
    console.error('Send immediate cheer error:', error);

    if (error instanceof z.ZodError) {
      return response(400, {
        error: 'VALIDATION_ERROR',
        message: '입력값이 올바르지 않습니다',
        details: error.errors
      });
    }

    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};