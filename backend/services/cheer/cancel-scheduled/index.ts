import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CANCELLATION_CUTOFF_MINUTES = Number(process.env.CHEER_SCHEDULED_CANCELLATION_CUTOFF_MINUTES ?? '5');

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

function getUserId(event: APIGatewayProxyEvent): string {
  const claims = event.requestContext.authorizer?.jwt?.claims || {};
  return String(claims.sub || claims['cognito:username'] || '');
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserId(event);
    if (!userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
      });
    }

    const cheerId = event.pathParameters?.cheerId;
    if (!cheerId) {
      return response(400, {
        error: 'MISSING_CHEER_ID',
        message: 'cheerId가 필요합니다',
      });
    }

    const getResult = await docClient.send(new GetCommand({
      TableName: process.env.CHEERS_TABLE!,
      Key: { cheerId },
    }));

    const cheer = getResult.Item as Record<string, any> | undefined;
    if (!cheer) {
      return response(404, {
        error: 'CHEER_NOT_FOUND',
      });
    }

    if (cheer.senderId !== userId) {
      return response(403, {
        error: 'FORBIDDEN',
      });
    }

    if (cheer.cheerType !== 'scheduled') {
      return response(400, {
        error: 'NOT_SCHEDULED_CHEER',
        message: '예약 응원만 취소할 수 있습니다',
      });
    }

    if (cheer.status === 'sent') {
      return response(409, {
        error: 'ALREADY_SENT',
        message: '이미 발송된 응원입니다',
      });
    }

    if (cheer.status === 'cancelled') {
      return response(409, {
        error: 'ALREADY_CANCELLED',
        message: '이미 취소된 응원입니다',
      });
    }

    if (cheer.status !== 'pending') {
      return response(409, {
        error: 'INVALID_STATUS',
        message: '취소 가능한 상태가 아닙니다',
      });
    }

    if (!cheer.scheduledTime) {
      return response(400, {
        error: 'MISSING_SCHEDULED_TIME',
      });
    }

    const scheduledTimeMs = new Date(String(cheer.scheduledTime)).getTime();
    if (Number.isNaN(scheduledTimeMs)) {
      return response(400, {
        error: 'INVALID_SCHEDULED_TIME',
      });
    }

    const cutoffTime = scheduledTimeMs - CANCELLATION_CUTOFF_MINUTES * 60 * 1000;
    if (Date.now() > cutoffTime) {
      return response(400, {
        error: 'CANCELLATION_WINDOW_CLOSED',
        message: `발송 ${CANCELLATION_CUTOFF_MINUTES}분 전에는 취소할 수 없어요`,
      });
    }

    const cancelledAt = new Date().toISOString();

    await docClient.send(new UpdateCommand({
      TableName: process.env.CHEERS_TABLE!,
      Key: { cheerId },
      UpdateExpression: 'SET #status = :cancelled, cancelledAt = :cancelledAt, cancelledBy = :cancelledBy',
      ConditionExpression: '#status = :pending AND senderId = :senderId',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':pending': 'pending',
        ':cancelled': 'cancelled',
        ':cancelledAt': cancelledAt,
        ':cancelledBy': userId,
        ':senderId': userId,
      },
    }));

    return response(200, {
      success: true,
      data: {
        cheerId,
        status: 'cancelled',
        cancelledAt,
      },
    });
  } catch (error: any) {
    console.error('Cancel scheduled cheer error:', error);
    if (error?.name === 'ConditionalCheckFailedException') {
      return response(409, {
        error: 'SCHEDULED_CHEER_STATE_CHANGED',
        message: '응원 상태가 변경되어 취소할 수 없습니다',
      });
    }
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
    });
  }
};
