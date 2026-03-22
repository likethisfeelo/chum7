import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

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

function parseGroups(rawGroups: unknown): string[] {
  if (!rawGroups) return [];
  if (Array.isArray(rawGroups)) return rawGroups.map(String).map(g => g.trim()).filter(Boolean);
  if (typeof rawGroups !== 'string') return [];

  return rawGroups
    .split(/[,:]/)
    .map(g => g.replace(/[\[\]"']/g, '').trim())
    .filter(Boolean);
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!requesterId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const groupsRaw = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
    const groups = parseGroups(groupsRaw);
    const allowed = ['admins', 'productowners', 'leaders'];
    if (!groups.some(g => allowed.includes(g))) {
      return response(403, { error: 'FORBIDDEN', message: '내 챌린지 조회 권한이 없습니다' });
    }

    const scanResult = await docClient.send(new ScanCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      FilterExpression: 'createdBy = :createdBy',
      ExpressionAttributeValues: {
        ':createdBy': requesterId,
      },
      Limit: 500,
    }));

    const challenges = (scanResult.Items ?? [])
      .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return response(200, {
      success: true,
      data: {
        challenges,
        total: challenges.length,
      },
    });
  } catch (error) {
    console.error('Admin list my challenges error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
