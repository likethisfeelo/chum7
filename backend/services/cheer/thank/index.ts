// backend/services/cheer/thank/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({});

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHEER_API_V2_CONTRACT = process.env.CHEER_API_V2_CONTRACT === 'true';
const DEFAULT_CHEER_API_V2_SUNSET_AT = '2026-06-30T00:00:00.000Z';

function resolveCheerApiV2SunsetAt(): string {
  const candidate = process.env.CHEER_API_V2_SUNSET_AT || DEFAULT_CHEER_API_V2_SUNSET_AT;
  const parsed = new Date(candidate);

  if (Number.isNaN(parsed.getTime())) {
    console.warn('Invalid CHEER_API_V2_SUNSET_AT, fallback to default', {
      candidate,
      fallback: DEFAULT_CHEER_API_V2_SUNSET_AT
    });
    return DEFAULT_CHEER_API_V2_SUNSET_AT;
  }

  return parsed.toISOString();
}

const CHEER_API_V2_SUNSET_AT = resolveCheerApiV2SunsetAt();

function response(statusCode: number, body: any, extraHeaders: Record<string, string> = {}): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
      ...extraHeaders
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
  let resolvedCheerId: string | undefined;

  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;

    let body: any = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        return response(400, {
          error: 'INVALID_JSON_BODY',
          message: '요청 본문 JSON 형식이 올바르지 않습니다'
        });
      }

      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return response(400, {
          error: 'INVALID_JSON_BODY',
          message: '요청 본문은 JSON 객체여야 합니다'
        });
      }
    }

    const cheerIdFromPathRaw = event.pathParameters?.cheerId;
    const cheerIdFromBodyRaw = body?.cheerId;

    if (cheerIdFromPathRaw !== undefined && (typeof cheerIdFromPathRaw !== 'string' || !cheerIdFromPathRaw.trim())) {
      return response(400, {
        error: 'INVALID_CHEER_ID',
        message: '경로 cheerId는 비어있지 않은 문자열이어야 합니다'
      });
    }

    if (cheerIdFromBodyRaw !== undefined && (typeof cheerIdFromBodyRaw !== 'string' || !cheerIdFromBodyRaw.trim())) {
      return response(400, {
        error: 'INVALID_CHEER_ID',
        message: 'body.cheerId는 비어있지 않은 문자열이어야 합니다'
      });
    }

    const cheerIdFromPath = typeof cheerIdFromPathRaw === 'string' ? cheerIdFromPathRaw.trim() : undefined;
    const cheerIdFromBody = typeof cheerIdFromBodyRaw === 'string' ? cheerIdFromBodyRaw.trim() : undefined;
    const legacyBodyRouteUsed = !cheerIdFromPath && !!cheerIdFromBody;

    if (!CHEER_API_V2_CONTRACT && legacyBodyRouteUsed) {
      console.warn('legacy thank route is deprecated; migrate to /cheers/{cheerId}/thank', {
        userId
      });
    }

    if (CHEER_API_V2_CONTRACT && !cheerIdFromPath) {
      console.warn('Blocked legacy thank request because CHEER_API_V2_CONTRACT is enabled', {
        userId,
        hasPathCheerId: !!cheerIdFromPath,
        hasBodyCheerId: !!cheerIdFromBody
      });

      return response(400, {
        error: 'LEGACY_THANK_ROUTE_DISABLED',
        message: '신규 감사 API 경로(/cheers/{cheerId}/thank)를 사용해 주세요'
      }, {
        Deprecation: 'true',
        Sunset: CHEER_API_V2_SUNSET_AT,
        Link: '</cheers/{cheerId}/thank>; rel="successor-version"'
      });
    }

    if (cheerIdFromPath && !UUID_V4_REGEX.test(cheerIdFromPath)) {
      return response(400, {
        error: 'INVALID_CHEER_ID_FORMAT',
        message: '경로 cheerId 형식이 올바르지 않습니다'
      });
    }

    if (cheerIdFromBody && !UUID_V4_REGEX.test(cheerIdFromBody)) {
      return response(400, {
        error: 'INVALID_CHEER_ID_FORMAT',
        message: 'body.cheerId 형식이 올바르지 않습니다'
      });
    }

    if (cheerIdFromPath && cheerIdFromBody && cheerIdFromPath !== cheerIdFromBody) {
      return response(400, {
        error: 'CHEER_ID_MISMATCH',
        message: '요청 경로의 cheerId와 body의 cheerId가 일치하지 않습니다'
      });
    }

    const cheerId = cheerIdFromPath || cheerIdFromBody;
    resolvedCheerId = cheerId;

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
      ConditionExpression: '(attribute_not_exists(isThanked) OR isThanked = :false) AND receiverId = :receiverId',
      ExpressionAttributeValues: {
        ':true': true,
        ':false': false,
        ':receiverId': userId,
        ':now': now
      }
    }));

    // 5. 발신자에게 알림 발송
    await sendThankNotification(cheer.senderId, '🐰'); // TODO: 실제 아이콘

    return response(200, {
      success: true,
      message: '감사를 전달했어요!'
    }, legacyBodyRouteUsed ? {
      Warning: '299 - Legacy cheer thank contract is deprecated; use /cheers/{cheerId}/thank',
      Deprecation: 'true',
      Sunset: CHEER_API_V2_SUNSET_AT,
      Link: '</cheers/{cheerId}/thank>; rel="successor-version"'
    } : {});

  } catch (error: any) {
    console.error('Thank cheer error:', error);

    if (error?.name === 'ConditionalCheckFailedException') {
      if (resolvedCheerId) {
        try {
          const latest = await docClient.send(new GetCommand({
            TableName: process.env.CHEERS_TABLE!,
            Key: { cheerId: resolvedCheerId }
          }));

          if (!latest.Item) {
            return response(404, {
              error: 'CHEER_NOT_FOUND',
              message: '응원을 찾을 수 없습니다'
            });
          }

          const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
          if (latest.Item.receiverId !== userId) {
            return response(403, {
              error: 'FORBIDDEN',
              message: '본인이 받은 응원에만 감사를 표할 수 있습니다'
            });
          }

          if (latest.Item.isThanked) {
            return response(409, {
              error: 'ALREADY_THANKED',
              message: '이미 감사를 표한 응원입니다'
            });
          }
        } catch (recheckError) {
          console.error('Thank cheer conditional failure recheck error:', recheckError);
        }
      }

      return response(409, {
        error: 'ALREADY_THANKED',
        message: '이미 감사를 표한 응원입니다'
      });
    }

    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
