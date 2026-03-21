// backend/services/cheer/thank/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { docClient } from '../../../shared/lib/dynamodb-client';

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


const LEGACY_THANK_WARNING_HEADER = '299 - Legacy cheer thank contract is deprecated; use /cheers/{cheerId}/thank';
const THANK_ROUTE_MODE_HEADER = 'X-Cheer-Thank-Route-Mode';
const CONDITIONAL_CHECK_FAILED_EXCEPTION = 'ConditionalCheckFailedException';

type ThankRouteMode = 'canonical' | 'legacy';
type JsonObject = Record<string, any>;

function withThankRouteMode(headers: Record<string, string>, routeMode: ThankRouteMode): Record<string, string> {
  return {
    ...headers,
    [THANK_ROUTE_MODE_HEADER]: routeMode
  };
}

function buildThankMigrationHeaders(): Record<string, string> {
  return {
    Warning: LEGACY_THANK_WARNING_HEADER,
    Deprecation: 'true',
    Sunset: CHEER_API_V2_SUNSET_AT,
    Link: '</cheers/{cheerId}/thank>; rel="successor-version"'
  };
}

function response(statusCode: number, body: unknown, extraHeaders: Record<string, string> = {}): APIGatewayProxyResult {
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

function canonicalRouteResponse(statusCode: number, body: JsonObject): APIGatewayProxyResult {
  return response(statusCode, body, withThankRouteMode({}, 'canonical'));
}



function isUuidV4(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLegacyBodyRouteAttempt(cheerIdFromPathRaw: unknown, hasBodyCheerIdField: boolean): boolean {
  return cheerIdFromPathRaw === undefined && hasBodyCheerIdField;
}

function hasOwnKey(target: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function hasDefinedValue(value: unknown): boolean {
  return value !== undefined;
}

function shouldWarnLegacyRoute(contractEnabled: boolean, legacyBodyRouteAttempted: boolean): boolean {
  return !contractEnabled && legacyBodyRouteAttempted;
}

function shouldBlockLegacyRoute(contractEnabled: boolean, hasPathCheerIdValue: boolean): boolean {
  return contractEnabled && !hasPathCheerIdValue;
}

function pickFirstDefinedString(...values: Array<string | undefined>): string | undefined {
  return values.find(hasDefinedValue);
}

function resolveThankRouteMode(legacyBodyRouteAttempted: boolean): ThankRouteMode {
  return legacyBodyRouteAttempted ? 'legacy' : 'canonical';
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function hasErrorName(value: unknown, expectedName: string): boolean {
  return isJsonObject(value)
    && 'name' in value
    && value.name === expectedName;
}

function isConditionalCheckFailed(error: unknown): boolean {
  return hasErrorName(error, CONDITIONAL_CHECK_FAILED_EXCEPTION);
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
  const requestUserId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
  let resolvedCheerId: string | undefined;
  let resolvedThankRouteMode: ThankRouteMode = 'canonical';
  const resolvedRouteModeHeaders = () => withThankRouteMode({}, resolvedThankRouteMode);
  const resolvedRouteModeResponse = (statusCode: number, body: JsonObject) =>
    response(statusCode, body, resolvedRouteModeHeaders());

  try {
    const userId = requestUserId;

    let body: JsonObject = {};
    if (event.body) {
      try {
        const parsedBody: unknown = JSON.parse(event.body);

        if (!isJsonObject(parsedBody)) {
          return canonicalRouteResponse(400, {
            error: 'INVALID_JSON_BODY',
            message: '요청 본문은 JSON 객체여야 합니다'
          });
        }

        body = parsedBody;
      } catch {
        return canonicalRouteResponse(400, {
          error: 'INVALID_JSON_BODY',
          message: '요청 본문 JSON 형식이 올바르지 않습니다'
        });
      }
    }

    const cheerIdFromPathRaw = event.pathParameters?.cheerId;
    const hasBodyCheerIdField = hasOwnKey(body, 'cheerId');
    const cheerIdFromBodyRaw = hasBodyCheerIdField ? body.cheerId : undefined;
    const hasBodyCheerIdValue = hasDefinedValue(cheerIdFromBodyRaw);
    const normalizedPathCheerId = normalizeString(cheerIdFromPathRaw);
    const normalizedBodyCheerId = normalizeString(cheerIdFromBodyRaw);
    const hasPathCheerIdValue = hasDefinedValue(normalizedPathCheerId);

    if (cheerIdFromPathRaw !== undefined && !normalizedPathCheerId) {
      return canonicalRouteResponse(400, {
        error: 'INVALID_CHEER_ID',
        message: '경로 cheerId는 비어있지 않은 문자열이어야 합니다'
      });
    }

    const legacyBodyRouteAttempted = isLegacyBodyRouteAttempt(cheerIdFromPathRaw, hasBodyCheerIdField);
    const thankRouteMode = resolveThankRouteMode(legacyBodyRouteAttempted);
    resolvedThankRouteMode = thankRouteMode;
    const migrationHeaders = legacyBodyRouteAttempted
      ? withThankRouteMode(buildThankMigrationHeaders(), thankRouteMode)
      : withThankRouteMode({}, thankRouteMode);
    const legacyAwareBadRequest = (body: Record<string, string>) => response(400, body, migrationHeaders);
    const routeAwareResponse = (statusCode: number, body: JsonObject) =>
      response(statusCode, body, withThankRouteMode({}, thankRouteMode));
    const blockedLegacyResponse = () => response(400, {
      error: 'LEGACY_THANK_ROUTE_DISABLED',
      message: '신규 감사 API 경로(/cheers/{cheerId}/thank)를 사용해 주세요'
    }, withThankRouteMode(buildThankMigrationHeaders(), 'legacy'));

    if (cheerIdFromBodyRaw !== undefined && !normalizedBodyCheerId) {
      return legacyAwareBadRequest({
        error: 'INVALID_CHEER_ID',
        message: 'body.cheerId는 비어있지 않은 문자열이어야 합니다'
      });
    }

    const cheerIdFromPath = normalizedPathCheerId;
    const cheerIdFromBody = normalizedBodyCheerId;

    if (shouldWarnLegacyRoute(CHEER_API_V2_CONTRACT, legacyBodyRouteAttempted)) {
      console.warn('legacy thank route is deprecated; migrate to /cheers/{cheerId}/thank', {
        userId,
        thankRouteMode,
        hasBodyCheerIdField,
        hasBodyCheerIdValue
      });
    }

    if (shouldBlockLegacyRoute(CHEER_API_V2_CONTRACT, hasPathCheerIdValue)) {
      console.warn('Blocked legacy thank request because CHEER_API_V2_CONTRACT is enabled', {
        userId,
        thankRouteMode,
        hasPathCheerId: hasPathCheerIdValue,
        hasBodyCheerId: hasBodyCheerIdField,
        hasBodyCheerIdValue
      });

      return blockedLegacyResponse();
    }

    if (cheerIdFromPath && !isUuidV4(cheerIdFromPath)) {
      return routeAwareResponse(400, {
        error: 'INVALID_CHEER_ID_FORMAT',
        message: '경로 cheerId 형식이 올바르지 않습니다'
      });
    }

    if (cheerIdFromBody && !isUuidV4(cheerIdFromBody)) {
      return legacyAwareBadRequest({
        error: 'INVALID_CHEER_ID_FORMAT',
        message: 'body.cheerId 형식이 올바르지 않습니다'
      });
    }

    if (cheerIdFromPath && cheerIdFromBody && cheerIdFromPath !== cheerIdFromBody) {
      return legacyAwareBadRequest({
        error: 'CHEER_ID_MISMATCH',
        message: '요청 경로의 cheerId와 body의 cheerId가 일치하지 않습니다'
      });
    }

    const cheerId = pickFirstDefinedString(cheerIdFromPath, cheerIdFromBody);
    resolvedCheerId = cheerId;

    if (!userId) {
      return routeAwareResponse(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다'
      });
    }

    if (!cheerId) {
      return legacyAwareBadRequest({
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
      return routeAwareResponse(404, {
        error: 'CHEER_NOT_FOUND',
        message: '응원을 찾을 수 없습니다'
      });
    }

    const cheer = cheerResult.Item;

    // 2. 권한 확인 (수신자만 감사 가능)
    if (cheer.receiverId !== userId) {
      return routeAwareResponse(403, {
        error: 'FORBIDDEN',
        message: '본인이 받은 응원에만 감사를 표할 수 있습니다'
      });
    }

    // 3. 이미 감사했는지 확인
    if (cheer.isThanked) {
      return routeAwareResponse(409, {
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

    // 5. 수신자 아이콘 조회 후 발신자에게 알림 발송
    let receiverIcon = '🐰';
    try {
      const userResult = await docClient.send(new GetCommand({
        TableName: process.env.USERS_TABLE!,
        Key: { userId },
        ProjectionExpression: 'animalIcon'
      }));
      if (userResult.Item?.animalIcon) {
        receiverIcon = userResult.Item.animalIcon;
      }
    } catch {
      // fallback to default icon
    }
    await sendThankNotification(cheer.senderId, receiverIcon);

    return response(200, {
      success: true,
      message: '감사를 전달했어요!'
    }, migrationHeaders);

  } catch (error: unknown) {
    console.error('Thank cheer error:', {
      error,
      resolvedCheerId,
      resolvedThankRouteMode
    });

    if (isConditionalCheckFailed(error)) {
      if (resolvedCheerId) {
        try {
          const latest = await docClient.send(new GetCommand({
            TableName: process.env.CHEERS_TABLE!,
            Key: { cheerId: resolvedCheerId }
          }));

          if (!latest.Item) {
            return resolvedRouteModeResponse(404, {
              error: 'CHEER_NOT_FOUND',
              message: '응원을 찾을 수 없습니다'
            });
          }

          if (latest.Item.receiverId !== requestUserId) {
            return resolvedRouteModeResponse(403, {
              error: 'FORBIDDEN',
              message: '본인이 받은 응원에만 감사를 표할 수 있습니다'
            });
          }

          if (latest.Item.isThanked) {
            return resolvedRouteModeResponse(409, {
              error: 'ALREADY_THANKED',
              message: '이미 감사를 표한 응원입니다'
            });
          }
        } catch (recheckError) {
          console.error('Thank cheer conditional failure recheck error:', recheckError);
        }
      }

      return resolvedRouteModeResponse(409, {
        error: 'ALREADY_THANKED',
        message: '이미 감사를 표한 응원입니다'
      });
    }

    return resolvedRouteModeResponse(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
