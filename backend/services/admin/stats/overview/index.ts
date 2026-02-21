import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function isAdmin(event: APIGatewayProxyEvent): boolean {
  const groups = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  if (!groups) return false;
  if (typeof groups === 'string') return groups === 'admins';
  return Array.isArray(groups) && groups.includes('admins');
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdmin(event)) {
      return response(403, { error: 'FORBIDDEN' });
    }

    const [usersResult, challengesResult, userChallengesResult] = await Promise.all([
      docClient.send(new ScanCommand({ TableName: process.env.USERS_TABLE!, Select: 'COUNT' })),
      docClient.send(new ScanCommand({ TableName: process.env.CHALLENGES_TABLE!, Select: 'COUNT' })),
      docClient.send(new ScanCommand({ TableName: process.env.USER_CHALLENGES_TABLE!, Select: 'COUNT' })),
    ]);

    return response(200, {
      success: true,
      data: {
        totalUsers: usersResult.Count || 0,
        totalChallenges: challengesResult.Count || 0,
        totalParticipations: userChallengesResult.Count || 0,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    console.error('Stats error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
