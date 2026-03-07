// backend/services/cheer/send-scheduled/index.ts
import { EventBridgeEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({});

const MAX_RETRIES = Number(process.env.CHEER_SCHEDULED_MAX_RETRIES ?? '3');
const RETRY_BACKOFF_MINUTES = (process.env.CHEER_SCHEDULED_BACKOFF_MINUTES ?? '1,5,15')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

function toFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/throttl|rate.?exceed|too many/i.test(message)) {
    return 'THROTTLED';
  }
  if (/timeout|timed out|socket/i.test(message)) {
    return 'TIMEOUT';
  }
  if (/authoriz|forbidden|access denied/i.test(message)) {
    return 'PERMISSION_DENIED';
  }

  return 'NOTIFICATION_SEND_FAILED';
}

function getBackoffMinutes(retryCountAfterIncrement: number): number {
  if (RETRY_BACKOFF_MINUTES.length === 0) {
    return 1;
  }

  const index = Math.min(retryCountAfterIncrement - 1, RETRY_BACKOFF_MINUTES.length - 1);
  return RETRY_BACKOFF_MINUTES[index];
}

// 푸시 알림 발송
async function sendPushNotification(
  userId: string,
  message: string,
  senderIcon: string,
  minutesRemaining: number
): Promise<void> {
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
}

async function moveToDeadLetter(cheer: Record<string, any>, failureCode: string, deadLetterReason: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30일 보관

  await docClient.send(new PutCommand({
    TableName: process.env.CHEER_DEAD_LETTERS_TABLE!,
    Item: {
      cheerId: cheer.cheerId,
      status: 'dead',
      failedAt: nowIso,
      retryCount: cheer.retryCount ?? 0,
      failureCode,
      deadLetterReason,
      originalScheduledTime: cheer.originalScheduledTime ?? cheer.scheduledTime,
      lastScheduledTime: cheer.scheduledTime,
      senderId: cheer.senderId,
      receiverId: cheer.receiverId,
      challengeId: cheer.challengeId ?? null,
      message: cheer.message ?? null,
      ttl,
    }
  }));
}

async function handleCheerFailure(cheer: Record<string, any>, error: unknown): Promise<'retry' | 'dead'> {
  const currentRetry = Number(cheer.retryCount ?? 0);
  const nextRetryCount = currentRetry + 1;
  const failureCode = toFailureCode(error);
  const deadLetterReason = error instanceof Error ? error.message : String(error);

  if (nextRetryCount > MAX_RETRIES) {
    await docClient.send(new UpdateCommand({
      TableName: process.env.CHEERS_TABLE!,
      Key: { cheerId: cheer.cheerId },
      UpdateExpression: 'SET #status = :failed, retryCount = :retryCount, failureCode = :failureCode, deadLetterReason = :deadLetterReason, failedAt = :failedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':failed': 'failed',
        ':retryCount': currentRetry,
        ':failureCode': failureCode,
        ':deadLetterReason': deadLetterReason,
        ':failedAt': new Date().toISOString(),
      }
    }));

    await moveToDeadLetter({
      ...cheer,
      retryCount: currentRetry,
    }, failureCode, deadLetterReason);

    return 'dead';
  }

  const backoffMinutes = getBackoffMinutes(nextRetryCount);
  const nextRetryAt = new Date(Date.now() + backoffMinutes * 60_000).toISOString();

  await docClient.send(new UpdateCommand({
    TableName: process.env.CHEERS_TABLE!,
    Key: { cheerId: cheer.cheerId },
    UpdateExpression: 'SET #status = :pending, retryCount = :retryCount, nextRetryAt = :nextRetryAt, scheduledTime = :scheduledTime, failureCode = :failureCode, originalScheduledTime = if_not_exists(originalScheduledTime, :originalScheduledTime)',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':pending': 'pending',
      ':retryCount': nextRetryCount,
      ':nextRetryAt': nextRetryAt,
      ':scheduledTime': nextRetryAt,
      ':failureCode': failureCode,
      ':originalScheduledTime': cheer.originalScheduledTime ?? cheer.scheduledTime,
    }
  }));

  return 'retry';
}

export const handler = async (event: EventBridgeEvent<string, any>) => {
  try {
    console.log('Scheduled cheer sender triggered', { eventId: event.id });

    const now = new Date();
    const currentTime = now.toISOString();

    // 5분 범위 내 발송 예정인 응원 조회 (5분 주기 실행)
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
    const summary = {
      scanned: pendingCheers.length,
      sent: 0,
      retried: 0,
      deadLettered: 0,
      skipped: 0,
    };

    for (const cheer of pendingCheers) {
      try {
        const processNow = new Date();
        // 발송 시간 확인 (정확한 시간 또는 지난 시간)
        const scheduledTime = new Date(cheer.scheduledTime);
        if (scheduledTime > processNow) {
          summary.skipped += 1;
          continue;
        }

        // 남은 시간 계산 (발신자의 델타)
        const minutesRemaining = cheer.senderDelta || 0;

        await sendPushNotification(
          cheer.receiverId,
          cheer.message,
          '🐻', // TODO: 발신자 아이콘 조회
          minutesRemaining
        );

        await docClient.send(new UpdateCommand({
          TableName: process.env.CHEERS_TABLE!,
          Key: { cheerId: cheer.cheerId },
          UpdateExpression: 'SET #status = :sent, sentAt = :sentAt REMOVE nextRetryAt, failureCode, deadLetterReason',
          ExpressionAttributeNames: {
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':sent': 'sent',
            ':sentAt': processNow.toISOString()
          }
        }));

        summary.sent += 1;
        console.log(`Cheer ${cheer.cheerId} sent successfully`);
      } catch (error) {
        console.error(`Error sending cheer ${cheer.cheerId}:`, error);
        const failureOutcome = await handleCheerFailure(cheer, error);
        if (failureOutcome === 'retry') {
          summary.retried += 1;
        } else {
          summary.deadLettered += 1;
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Scheduled cheers processed',
        ...summary,
      })
    };
  } catch (error: any) {
    console.error('Scheduled cheer sender error:', error);
    throw error;
  }
};
