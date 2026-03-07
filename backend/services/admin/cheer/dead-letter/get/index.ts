import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!hasOpsRole(event)) {
      return response(403, { error: 'FORBIDDEN' });
    }

    const cheerId = event.pathParameters?.cheerId;
    if (!cheerId) {
      return response(400, {
        error: 'MISSING_CHEER_ID',
      });
    }

    const [deadLetterResult, cheerResult] = await Promise.all([
      docClient.send(new GetCommand({
        TableName: process.env.CHEER_DEAD_LETTERS_TABLE!,
        Key: { cheerId },
      })),
      docClient.send(new GetCommand({
        TableName: process.env.CHEERS_TABLE!,
        Key: { cheerId },
      })),
    ]);

    if (!deadLetterResult.Item) {
      return response(404, {
        error: 'DEAD_LETTER_NOT_FOUND',
      });
    }

    return response(200, {
      success: true,
      data: {
        deadLetter: deadLetterResult.Item,
        cheerSnapshot: cheerResult.Item || null,
      },
    });
  } catch (error: any) {
    console.error('Admin dead-letter get error:', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
    });
  }
};
