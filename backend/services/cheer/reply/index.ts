import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({});

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_REPLY_RATE_LIMIT_PER_MINUTE = 10;
const DEFAULT_REPLY_RATE_LIMIT_WINDOW_SECONDS = 60;

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
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

function resolveRateLimitPerMinute(): number {
  const raw = Number(process.env.CHEER_REPLY_RATE_LIMIT_PER_MINUTE ?? DEFAULT_REPLY_RATE_LIMIT_PER_MINUTE);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_REPLY_RATE_LIMIT_PER_MINUTE;
  }

  return Math.floor(raw);
}

function resolveRateLimitWindowSeconds(): number {
  const raw = Number(process.env.CHEER_REPLY_RATE_LIMIT_WINDOW_SECONDS ?? DEFAULT_REPLY_RATE_LIMIT_WINDOW_SECONDS);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_REPLY_RATE_LIMIT_WINDOW_SECONDS;
  }

  return Math.floor(raw);
}

async function checkReplyRateLimit(receiverId: string): Promise<{ allowed: boolean; limit: number; current: number; windowSeconds: number }> {
  const limit = resolveRateLimitPerMinute();
  const windowSeconds = resolveRateLimitWindowSeconds();
  const threshold = new Date(Date.now() - (windowSeconds * 1000)).toISOString();

  const query = await docClient.send(new QueryCommand({
    TableName: process.env.CHEERS_TABLE!,
    IndexName: 'receiverId-index',
    KeyConditionExpression: 'receiverId = :receiverId',
    ExpressionAttributeValues: {
      ':receiverId': receiverId
    },
    ScanIndexForward: false,
    Limit: 100
  }));

  const current = (query.Items || []).filter((item: any) =>
    typeof item.repliedAt === 'string' && item.repliedAt >= threshold
  ).length;

  return {
    allowed: current < limit,
    limit,
    current,
    windowSeconds
  };
}

// 발신자에게 답장 알림 발송
async function sendReplyNotification(senderId: string, message: string): Promise<void> {
  try {
    await snsClient.send(new PublishCommand({
      TopicArn: process.env.SNS_TOPIC_ARN!,
      Message: JSON.stringify({
        userId: senderId,
        notification: {
          title: '응원에 답장이 도착했어요 💬',
          body: message,
          data: {
            type: 'cheer_replied',
            timestamp: new Date().toISOString()
          }
        }
      })
    }));
  } catch (error) {
    console.error('Reply notification error:', error);
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startedAt = Date.now();
  const path = event.requestContext.http?.path || event.rawPath || '/cheers/{cheerId}/reply';

  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    console.info('Cheer reply request received', { path, userId });
    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const cheerId = event.pathParameters?.cheerId?.trim();
    if (!cheerId) {
      return response(400, { error: 'MISSING_CHEER_ID', message: '응원 ID가 필요합니다' });
    }

    if (!UUID_V4_REGEX.test(cheerId)) {
      return response(400, { error: 'INVALID_CHEER_ID_FORMAT', message: '응원 ID 형식이 올바르지 않습니다' });
    }

    let message = '';
    try {
      const body = JSON.parse(event.body || '{}') as { message?: unknown };
      message = typeof body.message === 'string' ? body.message.trim() : '';
    } catch {
      return response(400, { error: 'INVALID_JSON_BODY', message: '요청 본문 JSON 형식이 올바르지 않습니다' });
    }

    if (!message || message.length > 200) {
      return response(400, { error: 'INVALID_REPLY_MESSAGE', message: '답장은 1~200자 문자열이어야 합니다' });
    }

    const rateLimit = await checkReplyRateLimit(userId);
    if (!rateLimit.allowed) {
      console.warn('Cheer reply rate limit exceeded', { path, userId, ...rateLimit });
      return response(429, {
        error: 'REPLY_RATE_LIMIT_EXCEEDED',
        message: '짧은 시간 내 답장 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요',
        limit: rateLimit.limit,
        current: rateLimit.current,
        windowSeconds: rateLimit.windowSeconds
      });
    }

    const found = await docClient.send(new GetCommand({
      TableName: process.env.CHEERS_TABLE!,
      Key: { cheerId }
    }));

    const cheer = found.Item as { receiverId?: string; senderId?: string; replyMessage?: string } | undefined;
    if (!cheer) {
      return response(404, { error: 'CHEER_NOT_FOUND', message: '응원을 찾을 수 없습니다' });
    }

    if (cheer.receiverId !== userId) {
      return response(403, { error: 'FORBIDDEN', message: '본인이 받은 응원에만 답장할 수 있습니다' });
    }

    if (cheer.replyMessage) {
      return response(409, { error: 'ALREADY_REPLIED', message: '이미 답장을 보냈습니다' });
    }

    const now = new Date().toISOString();

    await docClient.send(new UpdateCommand({
      TableName: process.env.CHEERS_TABLE!,
      Key: { cheerId },
      UpdateExpression: 'SET replyMessage = :message, repliedAt = :now',
      ConditionExpression: 'attribute_not_exists(replyMessage) AND receiverId = :receiverId',
      ExpressionAttributeValues: {
        ':message': message,
        ':now': now,
        ':receiverId': userId
      }
    }));

    if (cheer.senderId) {
      await sendReplyNotification(cheer.senderId, message);
    }

    const latencyMs = Date.now() - startedAt;
    console.info('Cheer reply success', { path, userId, cheerId, latencyMs });

    return response(200, {
      success: true,
      message: '답장을 보냈습니다',
      data: {
        cheerId,
        replyMessage: message,
        repliedAt: now
      }
    });
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return response(409, { error: 'ALREADY_REPLIED', message: '이미 답장을 보냈습니다' });
    }

    const latencyMs = Date.now() - startedAt;
    console.error('Reply cheer error:', {
      path,
      latencyMs,
      error
    });
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
