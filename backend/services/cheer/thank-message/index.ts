// backend/services/cheer/thank-message/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { BatchGetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { docClient } from '../../../shared/lib/dynamodb-client';
import { response } from '../../../shared/lib/api-response';

const snsClient = new SNSClient({});

const MAX_MESSAGE_LENGTH = 30;
const MAX_CHEER_IDS = 50;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    let body: Record<string, unknown> = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        return response(400, { error: 'INVALID_JSON', message: '요청 본문이 올바르지 않습니다' });
      }
    }

    const cheerIds = body.cheerIds;
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!Array.isArray(cheerIds) || cheerIds.length === 0) {
      return response(400, { error: 'MISSING_CHEER_IDS', message: 'cheerIds가 필요합니다' });
    }
    if (cheerIds.length > MAX_CHEER_IDS) {
      return response(400, { error: 'TOO_MANY_CHEER_IDS', message: `한 번에 최대 ${MAX_CHEER_IDS}건까지 처리 가능합니다` });
    }
    if (!message) {
      return response(400, { error: 'MISSING_MESSAGE', message: '메시지를 입력해주세요' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return response(400, { error: 'MESSAGE_TOO_LONG', message: `메시지는 ${MAX_MESSAGE_LENGTH}자 이내여야 합니다` });
    }

    // 해당 응원들이 실제로 나(userId=receiverId)의 것인지 확인
    const keys = cheerIds.map((id: string) => ({ cheerId: id }));
    const batchResult = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [process.env.CHEERS_TABLE!]: { Keys: keys },
      },
    }));

    const items = batchResult.Responses?.[process.env.CHEERS_TABLE!] ?? [];
    const validCheers = items.filter((item: any) => item.senderId === userId);

    if (validCheers.length === 0) {
      return response(404, { error: 'NO_VALID_CHEERS', message: '업데이트할 수 있는 응원이 없습니다' });
    }

    const nowISO = new Date().toISOString();

    // thankMessage 일괄 업데이트 + 발신자에게 재알림
    await Promise.allSettled(validCheers.map(async (cheer: any) => {
      await docClient.send(new UpdateCommand({
        TableName: process.env.CHEERS_TABLE!,
        Key: { cheerId: cheer.cheerId },
        UpdateExpression: 'SET thankMessage = :message, thankMessageAt = :now',
        ConditionExpression: 'receiverId = :userId AND isThankScoreGranted = :true',
        ExpressionAttributeValues: {
          ':message': message,
          ':now': nowISO,
          ':userId': userId,
          ':true': true,
        },
      }));

      if (process.env.SNS_TOPIC_ARN) {
        await snsClient.send(new PublishCommand({
          TopicArn: process.env.SNS_TOPIC_ARN!,
          Message: JSON.stringify({
            userId: cheer.receiverId,
            notification: {
              title: '감사 메시지가 도착했어요 💝',
              body: message,
              data: { type: 'cheer_thank_message', cheerId: cheer.cheerId, timestamp: nowISO },
            },
          }),
        }));
      }
    }));

    return response(200, {
      success: true,
      message: '감사 메시지를 전달했어요!',
      data: { updatedCount: validCheers.length },
    });

  } catch (error: any) {
    console.error('Thank message error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
