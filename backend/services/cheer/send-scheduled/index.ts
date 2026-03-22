// backend/services/cheer/send-scheduled/index.ts
import { EventBridgeEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

function normalizeProgress(progress: any): any[] {
  if (!progress) return [];
  if (Array.isArray(progress)) return progress;
  if (typeof progress === 'object') return Object.values(progress);
  return [];
}

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});
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

// 수신자가 해당 day를 완료했는지 확인
async function isReceiverCompletedToday(
  receiverId: string,
  challengeId: string,
  day: number,
): Promise<boolean> {
  if (!process.env.USER_CHALLENGES_TABLE) return false;

  const result = await docClient.send(new QueryCommand({
    TableName: process.env.USER_CHALLENGES_TABLE!,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :userId',
    FilterExpression: 'challengeId = :challengeId',
    ExpressionAttributeValues: {
      ':userId': receiverId,
      ':challengeId': challengeId,
    },
  }));

  const userChallenge = result.Items?.[0];
  if (!userChallenge) return false;

  const progress = normalizeProgress(userChallenge.progress);
  const dayEntry = progress.find((p: any) => Number(p?.day) === day);
  return dayEntry?.status === 'success';
}

// 발신자에게 감사 점수 적립 (수신자가 이미 완료한 경우)
async function grantThankScoreToSender(
  senderId: string,
  cheerId: string,
  challengeId: string,
  nowDate: Date,
): Promise<void> {
  const nowIso = nowDate.toISOString();

  // 1. cheer: status = receiver_completed, isThankScoreGranted = true
  await docClient.send(new UpdateCommand({
    TableName: process.env.CHEERS_TABLE!,
    Key: { cheerId },
    UpdateExpression: 'SET #status = :done, isThankScoreGranted = :true, thankScoreGrantedAt = :now',
    ConditionExpression: '#status = :pending',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':done': 'receiver_completed',
      ':pending': 'pending',
      ':true': true,
      ':now': nowIso,
    },
  }));

  // 2. 발신자 userChallenge: thankScore += 1
  if (!process.env.USER_CHALLENGES_TABLE) return;

  const senderResult = await docClient.send(new QueryCommand({
    TableName: process.env.USER_CHALLENGES_TABLE!,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :userId',
    FilterExpression: 'challengeId = :challengeId',
    ExpressionAttributeValues: {
      ':userId': senderId,
      ':challengeId': challengeId,
    },
  }));

  const senderChallenge = senderResult.Items?.[0];
  if (!senderChallenge?.userChallengeId) return;

  await docClient.send(new UpdateCommand({
    TableName: process.env.USER_CHALLENGES_TABLE!,
    Key: { userChallengeId: senderChallenge.userChallengeId },
    UpdateExpression: 'ADD thankScore :one SET updatedAt = :now',
    ExpressionAttributeValues: {
      ':one': 1,
      ':now': nowIso,
    },
  }));
}

// 푸시 알림 발송
async function sendPushNotification(
  userId: string,
  cheerId: string
): Promise<void> {
  await snsClient.send(new PublishCommand({
    TopicArn: process.env.SNS_TOPIC_ARN!,
    Message: JSON.stringify({
      userId,
      notification: {
        title: '응원이 도착했어요',
        body: '당신을 응원합니다',
        data: {
          type: 'cheer_received',
          cheerId,
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
      raceSkipped: 0,
      senderScoreGranted: 0,
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

        // 수신자가 이미 완료했으면 알림 대신 발신자에게 감사 점수 적립
        const receiverDone = cheer.day != null
          ? await isReceiverCompletedToday(cheer.receiverId, cheer.challengeId, cheer.day)
          : false;

        if (receiverDone) {
          await grantThankScoreToSender(cheer.senderId, cheer.cheerId, cheer.challengeId, processNow);
          summary.senderScoreGranted += 1;
          console.log(`Cheer ${cheer.cheerId}: receiver already done, granted thank score to sender ${cheer.senderId}`);
        } else {
          await sendPushNotification(cheer.receiverId, cheer.cheerId);

          await docClient.send(new UpdateCommand({
            TableName: process.env.CHEERS_TABLE!,
            Key: { cheerId: cheer.cheerId },
            UpdateExpression: 'SET #status = :sent, sentAt = :sentAt REMOVE nextRetryAt, failureCode, deadLetterReason',
            ConditionExpression: '#status = :pending',
            ExpressionAttributeNames: {
              '#status': 'status'
            },
            ExpressionAttributeValues: {
              ':pending': 'pending',
              ':sent': 'sent',
              ':sentAt': processNow.toISOString()
            }
          }));

          summary.sent += 1;
          console.log(`Cheer ${cheer.cheerId} sent successfully`);
        }
      } catch (error: any) {
        if (error?.name === 'ConditionalCheckFailedException') {
          summary.raceSkipped += 1;
          console.info(`Cheer ${cheer.cheerId} skipped due to concurrent state change`);
          continue;
        }

        console.error(`Error sending cheer ${cheer.cheerId}:`, error);
        const failureOutcome = await handleCheerFailure(cheer, error);
        if (failureOutcome === 'retry') {
          summary.retried += 1;
        } else {
          summary.deadLettered += 1;
        }
      }
    }

    console.log('Scheduled cheer sender summary', summary);

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
