// backend/services/auth/get-profile/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;

    if (!userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다'
      });
    }

    const result = await docClient.send(new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId }
    }));

    if (!result.Item) {
      return response(404, {
        error: 'USER_NOT_FOUND',
        message: '사용자를 찾을 수 없습니다'
      });
    }

    const user = result.Item;

    const fallbackCheerTickets = Number(user.cheerTickets || 0);
    let availableCheerTickets = Number.isFinite(fallbackCheerTickets)
      ? Math.max(0, Math.floor(fallbackCheerTickets))
      : 0;
    if (process.env.USER_CHEER_TICKETS_TABLE) {
      try {
        let lastEvaluatedKey: Record<string, any> | undefined = undefined;
        let totalCount = 0;

        do {
          const ticketResult = await docClient.send(new QueryCommand({
            TableName: process.env.USER_CHEER_TICKETS_TABLE,
            IndexName: 'userId-status-index',
            KeyConditionExpression: 'userId = :userId AND #status = :status',
            ExpressionAttributeNames: {
              '#status': 'status'
            },
            ExpressionAttributeValues: {
              ':userId': userId,
              ':status': 'available'
            },
            Select: 'COUNT',
            ExclusiveStartKey: lastEvaluatedKey
          }));

          const pageCount = Number(ticketResult.Count || 0);
          totalCount += Number.isFinite(pageCount) ? Math.max(0, Math.floor(pageCount)) : 0;
          lastEvaluatedKey = ticketResult.LastEvaluatedKey;
        } while (lastEvaluatedKey);

        availableCheerTickets = totalCount;
      } catch (ticketCountError) {
        console.error('Failed to compute ticket count from USER_CHEER_TICKETS_TABLE, fallback to user.cheerTickets', {
          userId,
          ticketCountError
        });
      }
    }

    return response(200, {
      success: true,
      data: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        profileImageUrl: user.profileImageUrl,
        identityPhrase: user.identityPhrase,
        level: user.level,
        exp: user.exp,
        animalIcon: user.animalIcon,
        cheerTickets: availableCheerTickets,
        stats: user.stats,
        createdAt: user.createdAt
      }
    });

  } catch (error: any) {
    console.error('Get profile error:', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};