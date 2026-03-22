import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function parseGroups(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[,:]/)
    .map((value) => value.replace(/[\[\]"']/g, '').trim())
    .filter(Boolean);
}

function hasOpsRole(event: APIGatewayProxyEvent): boolean {
  const groups = parseGroups(event.requestContext.authorizer?.jwt?.claims['cognito:groups']);
  return groups.some((group) => ['admins', 'productowners', 'managers'].includes(group));
}

function getActorId(event: APIGatewayProxyEvent): string {
  const claims = event.requestContext.authorizer?.jwt?.claims || {};
  return String(claims.sub || claims.email || 'unknown');
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!hasOpsRole(event)) {
      return response(403, { error: 'FORBIDDEN' });
    }

    const cheerId = event.pathParameters?.cheerId;
    if (!cheerId) {
      return response(400, { error: 'MISSING_CHEER_ID' });
    }

    const deadLetterResult = await docClient.send(new GetCommand({
      TableName: process.env.CHEER_DEAD_LETTERS_TABLE!,
      Key: { cheerId },
    }));

    const deadLetter = deadLetterResult.Item;
    if (!deadLetter || deadLetter.status !== 'dead') {
      return response(404, {
        error: 'DEAD_LETTER_NOT_FOUND',
        message: '재처리 가능한 dead-letter를 찾을 수 없습니다',
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const requeueScheduledTime = new Date(now.getTime() + 60 * 1000).toISOString();

    await docClient.send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: process.env.CHEERS_TABLE!,
            Key: { cheerId },
            UpdateExpression: 'SET #status = :pending, retryCount = :retryCount, scheduledTime = :scheduledTime, nextRetryAt = :nextRetryAt, requeuedAt = :requeuedAt REMOVE deadLetterReason, failureCode, failedAt',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':pending': 'pending',
              ':retryCount': 0,
              ':scheduledTime': requeueScheduledTime,
              ':nextRetryAt': requeueScheduledTime,
              ':requeuedAt': nowIso,
            },
            ConditionExpression: 'attribute_exists(cheerId)',
          },
        },
        {
          Update: {
            TableName: process.env.CHEER_DEAD_LETTERS_TABLE!,
            Key: { cheerId },
            UpdateExpression: 'SET #status = :status, requeuedAt = :requeuedAt, requeuedBy = :requeuedBy',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':status': 'requeued',
              ':requeuedAt': nowIso,
              ':requeuedBy': getActorId(event),
              ':dead': 'dead',
            },
            ConditionExpression: '#status = :dead',
          },
        },
      ],
    }));

    return response(200, {
      success: true,
      data: {
        cheerId,
        scheduledTime: requeueScheduledTime,
      },
    });
  } catch (error: any) {
    console.error('Admin dead-letter requeue error:', error);
    if (error?.name === 'ConditionalCheckFailedException' || error?.name === 'TransactionCanceledException') {
      return response(409, {
        error: 'REQUEUE_CONFLICT',
        message: '이미 재처리 되었거나 원본 응원이 존재하지 않습니다',
      });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
