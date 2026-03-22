import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

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

function parseNextToken(nextToken?: string | null): Record<string, any> | undefined {
  if (!nextToken) return undefined;
  try {
    return JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'));
  } catch {
    throw new Error('INVALID_NEXT_TOKEN');
  }
}

function toNextToken(lastEvaluatedKey?: Record<string, any>) {
  if (!lastEvaluatedKey) return null;
  return Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf-8').toString('base64');
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!hasOpsRole(event)) {
      return response(403, { error: 'FORBIDDEN' });
    }

    const query = event.queryStringParameters || {};
    const limit = Math.min(Math.max(Number(query.limit || 30), 1), 100);
    const failureCode = query.failureCode?.trim();

    let startKey: Record<string, any> | undefined;
    try {
      startKey = parseNextToken(query.nextToken);
    } catch {
      return response(400, {
        error: 'INVALID_NEXT_TOKEN',
        message: 'nextToken 형식이 올바르지 않습니다',
      });
    }

    const queryResult = await docClient.send(new QueryCommand({
      TableName: process.env.CHEER_DEAD_LETTERS_TABLE!,
      IndexName: 'failedAt-index',
      KeyConditionExpression: '#status = :status',
      FilterExpression: failureCode ? 'failureCode = :failureCode' : undefined,
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': 'dead',
        ...(failureCode ? { ':failureCode': failureCode } : {}),
      },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: startKey,
    }));

    return response(200, {
      success: true,
      data: {
        deadLetters: queryResult.Items || [],
        count: queryResult.Count || 0,
        nextToken: toNextToken(queryResult.LastEvaluatedKey),
      },
    });
  } catch (error: any) {
    console.error('Admin dead-letter list error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
