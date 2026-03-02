import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

function parseGroups(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[,:]/)
    .map((s) => s.replace(/[\[\]"']/g, '').trim())
    .filter(Boolean);
}

function isAdmin(event: APIGatewayProxyEvent): boolean {
  const groups = parseGroups(event.requestContext.authorizer?.jwt?.claims['cognito:groups']);
  return groups.includes('admins') || groups.includes('productowners') || groups.includes('managers');
}

function parseNextToken(nextToken?: string | null): Record<string, unknown> | undefined {
  if (!nextToken) return undefined;
  try {
    return JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'));
  } catch {
    throw new Error('INVALID_NEXT_TOKEN');
  }
}

function toNextToken(lastEvaluatedKey?: Record<string, unknown>): string | null {
  if (!lastEvaluatedKey) return null;
  return Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf-8').toString('base64');
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdmin(event)) {
      return response(403, { error: 'FORBIDDEN' });
    }

    const query = event.queryStringParameters || {};
    const eventName = query.eventName?.trim();
    if (!eventName) {
      return response(400, { error: 'INVALID_EVENT_NAME', message: 'eventName 쿼리 파라미터가 필요합니다.' });
    }

    const limit = Math.min(Math.max(Number(query.limit || 50), 1), 100);

    let exclusiveStartKey: Record<string, unknown> | undefined;
    try {
      exclusiveStartKey = parseNextToken(query.nextToken);
    } catch {
      return response(400, { error: 'INVALID_NEXT_TOKEN' });
    }

    const from = query.from?.trim();
    const to = query.to?.trim();

    const expressionValues: Record<string, unknown> = {
      ':eventName': eventName,
    };

    let keyConditionExpression = 'eventName = :eventName';
    if (from && to) {
      keyConditionExpression += ' AND occurredAt BETWEEN :from AND :to';
      expressionValues[':from'] = from;
      expressionValues[':to'] = to;
    } else if (from) {
      keyConditionExpression += ' AND occurredAt >= :from';
      expressionValues[':from'] = from;
    } else if (to) {
      keyConditionExpression += ' AND occurredAt <= :to';
      expressionValues[':to'] = to;
    }

    const result = await docClient.send(new QueryCommand({
      TableName: process.env.KPI_EVENTS_TABLE!,
      IndexName: 'eventName-occurredAt-index',
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionValues,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
      ScanIndexForward: false,
    }));

    return response(200, {
      success: true,
      data: {
        items: result.Items || [],
        count: result.Items?.length || 0,
        nextToken: toNextToken(result.LastEvaluatedKey as Record<string, unknown> | undefined),
      },
    });
  } catch (error) {
    console.error('admin kpi list error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
