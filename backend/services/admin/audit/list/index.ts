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

function parseGroups(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[,:]/)
    .map((s) => s.replace(/[\[\]"']/g, '').trim())
    .filter(Boolean);
}

function hasOpsRole(event: APIGatewayProxyEvent): boolean {
  const groups = parseGroups(event.requestContext.authorizer?.jwt?.claims['cognito:groups']);
  return groups.includes('admins') || groups.includes('productowners') || groups.includes('leaders') || groups.includes('managers');
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


const ALLOWED_ACTIONS = new Set(['approved', 'rejected', 'auto_approved']);

function normalizeActionFilter(raw?: string | null): string | null {
  if (!raw || raw === 'all') return null;
  if (!ALLOWED_ACTIONS.has(raw)) throw new Error('INVALID_ACTION_FILTER');
  return raw;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!hasOpsRole(event)) return response(403, { error: 'FORBIDDEN' });

    const query = event.queryStringParameters || {};
    const limit = Math.min(Math.max(Number(query.limit || 30), 1), 100);
    let actionFilter: string | null = null;
    try {
      actionFilter = normalizeActionFilter(query.action);
    } catch {
      return response(400, {
        error: 'INVALID_ACTION_FILTER',
        message: 'action 파라미터는 approved/rejected/auto_approved/all 중 하나여야 합니다',
      });
    }

    let startKey: Record<string, any> | undefined;
    try {
      startKey = parseNextToken(query.nextToken);
    } catch {
      return response(400, {
        error: 'INVALID_NEXT_TOKEN',
        message: 'nextToken 형식이 올바르지 않습니다',
      });
    }

    const submissionsResult = await docClient.send(
      new ScanCommand({
        TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
        Limit: 500,
        ExclusiveStartKey: startKey,
      }),
    );

    const reviewed = (submissionsResult.Items || [])
      .filter((s: any) => {
        if (!s.reviewedAt || !s.reviewedBy) return false;
        if (!actionFilter) return true;
        return s.status === actionFilter;
      })
      .map((s: any) => ({
        auditType: 'quest_submission_review',
        actorId: s.reviewedBy,
        action: s.status,
        targetId: s.submissionId,
        questId: s.questId,
        note: s.reviewNote || null,
        createdAt: s.reviewedAt,
      }))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    return response(200, {
      success: true,
      data: {
        logs: reviewed,
        count: reviewed.length,
        nextToken: toNextToken(submissionsResult.LastEvaluatedKey),
      },
    });
  } catch (error: any) {
    console.error('Admin audit list error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
