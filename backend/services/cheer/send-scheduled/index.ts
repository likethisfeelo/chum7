// backend/services/cheer/send-scheduled/index.ts
import { EventBridgeEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({});

// 푸시 알림 발송
async function sendPushNotification(
  userId: string,
  message: string,
  senderIcon: string,
  minutesRemaining: number
): Promise<void> {
  try {
    await snsClient.send(new PublishCommand({
      TopicArn: process.env.SNS_TOPIC_ARN!,
      Message: JSON.stringify({
        userId,
        notification: {
          title: '응원이 도착했어요! 💪',
          body: `${senderIcon}님이 응원을 보냈어요! ${minutesRemaining}분 남았어요`,
          data: {
            type: 'cheer_scheduled',
            message,
            minutesRemaining,
            timestamp: new Date().toISOString()
          }
        }
      })
    }));
  } catch (error) {
    console.error('Push notification error:', error);
  }
}

export const handler = async (event: EventBridgeEvent<string, any>) => {
  try {
    console.log('Scheduled cheer sender triggered');

    const now = new Date();
    const currentTime = now.toISOString();
    
    // 5분 범위 내 발송 예정인 응원 조회 (매분마다 실행되므로)
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60000).toISOString();

    // pending 상태의 예약 응원 조회
    const result = await docClient.send(new QueryCommand({
      TableName: process.env.CHEERS_TABLE!,
      IndexName: 'scheduled-index',
      KeyConditionExpression: '#status = :status AND scheduledTime BETWEEN :now AND :later',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'pending',
        ':now': currentTime,
        ':later': fiveMinutesLater
      }
    }));

    const pendingCheers = result.Items || [];
    console.log(`Found ${pendingCheers.length} pending cheers to send`);

    for (const cheer of pendingCheers) {
      try {
        // 발송 시간 확인 (정확한 시간 또는 지난 시간)
        const scheduledTime = new Date(cheer.scheduledTime);
        if (scheduledTime > now) {
          continue; // 아직 시간이 안 됨
        }

        // 남은 시간 계산 (발신자의 델타)
        const minutesRemaining = cheer.senderDelta || 0;

        // 푸시 알림 발송
        await sendPushNotification(
          cheer.receiverId,
          cheer.message,
          '🐻', // TODO: 발신자 아이콘 조회
          minutesRemaining
        );

        // 상태 업데이트
        await docClient.send(new UpdateCommand({
          TableName: process.env.CHEERS_TABLE!,
          Key: { cheerId: cheer.cheerId },
          UpdateExpression: 'SET #status = :sent, sentAt = :sentAt',
          ExpressionAttributeNames: {
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':sent': 'sent',
            ':sentAt': now.toISOString()
          }
        }));

        console.log(`Cheer ${cheer.cheerId} sent successfully`);

      } catch (error) {
        console.error(`Error sending cheer ${cheer.cheerId}:`, error);
        
        // 실패 상태 업데이트
        await docClient.send(new UpdateCommand({
          TableName: process.env.CHEERS_TABLE!,
          Key: { cheerId: cheer.cheerId },
          UpdateExpression: 'SET #status = :failed',
          ExpressionAttributeNames: {
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':failed': 'failed'
          }
        }));
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        processed: pendingCheers.length,
        message: 'Scheduled cheers processed'
      })
    };

  } catch (error: any) {
    console.error('Scheduled cheer sender error:', error);
    throw error;
  }
};