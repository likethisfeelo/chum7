import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const DEFAULT_LOOKBACK_DAYS = 7;
const MAX_QUERY_PAGES = 50;

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

function parseIsoOrNull(value?: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

async function countByStatusInRange(status: 'dead' | 'requeued', fromIso: string, toIso: string): Promise<number> {
  let total = 0;
  let lastKey: Record<string, any> | undefined;
  let pages = 0;

  do {
    const result = await docClient.send(new QueryCommand({
      TableName: process.env.CHEER_DEAD_LETTERS_TABLE!,
      IndexName: 'failedAt-index',
      KeyConditionExpression: '#status = :status AND failedAt BETWEEN :from AND :to',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': status,
        ':from': fromIso,
        ':to': toIso,
      },
      Select: 'COUNT',
      ExclusiveStartKey: lastKey,
    }));

    total += Number(result.Count || 0);
    lastKey = result.LastEvaluatedKey as Record<string, any> | undefined;
    pages += 1;
  } while (lastKey && pages < MAX_QUERY_PAGES);

  return total;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!hasOpsRole(event)) {
      return response(403, { error: 'FORBIDDEN' });
    }

    const query = event.queryStringParameters || {};
    const parsedFrom = parseIsoOrNull(query.fromIso);
    const parsedTo = parseIsoOrNull(query.toIso) ?? new Date().toISOString();

    if ((query.fromIso && !parsedFrom) || (query.toIso && !parseIsoOrNull(query.toIso))) {
      return response(400, {
        error: 'INVALID_ISO_RANGE',
        message: 'fromIso/toIso는 ISO-8601 형식이어야 합니다',
      });
    }

    const fromIso = parsedFrom ?? new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const toIso = parsedTo;

    if (Date.parse(fromIso) > Date.parse(toIso)) {
      return response(400, {
        error: 'INVALID_ISO_RANGE',
        message: 'fromIso는 toIso보다 이후일 수 없습니다',
      });
    }

    const [deadCount, requeuedCount] = await Promise.all([
      countByStatusInRange('dead', fromIso, toIso),
      countByStatusInRange('requeued', fromIso, toIso),
    ]);

    return response(200, {
      success: true,
      data: {
        fromIso,
        toIso,
        deadCount,
        requeuedCount,
        unresolvedCount: Math.max(deadCount - requeuedCount, 0),
      },
    });
  } catch (error: any) {
    console.error('Admin dead-letter stats error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
