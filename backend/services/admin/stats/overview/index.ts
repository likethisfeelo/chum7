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

function isAdmin(event: APIGatewayProxyEvent): boolean {
  const groups = parseGroups(event.requestContext.authorizer?.jwt?.claims['cognito:groups']);
  return groups.includes('admins') || groups.includes('productowners') || groups.includes('managers');
}

function safeDate(input?: string): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdmin(event)) {
      return response(403, { error: 'FORBIDDEN' });
    }

    const [usersResult, challengesResult, userChallengesResult, submissionsResult, verificationsResult] = await Promise.all([
      docClient.send(new ScanCommand({ TableName: process.env.USERS_TABLE!, Select: 'COUNT' })),
      docClient.send(new ScanCommand({ TableName: process.env.CHALLENGES_TABLE!, Select: 'COUNT' })),
      docClient.send(new ScanCommand({ TableName: process.env.USER_CHALLENGES_TABLE!, Select: 'COUNT' })),
      docClient.send(new ScanCommand({ TableName: process.env.QUEST_SUBMISSIONS_TABLE! })),
      docClient.send(new ScanCommand({ TableName: process.env.VERIFICATIONS_TABLE! })),
    ]);

    const submissions = submissionsResult.Items || [];
    const verifications = verificationsResult.Items || [];

    const pendingReviewCount = submissions.filter((s: any) => s.status === 'pending').length;
    const rejectedCount = submissions.filter((s: any) => s.status === 'rejected').length;
    const approvedCount = submissions.filter((s: any) => s.status === 'approved' || s.status === 'auto_approved').length;
    const reviewTotal = pendingReviewCount + rejectedCount + approvedCount;

    const remedyCount = verifications.filter((v: any) => v.type === 'remedy').length;
    const extraCount = verifications.filter((v: any) => v.isExtra === true).length;

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    const recentVerifications = verifications.filter((v: any) => {
      const created = safeDate(v.createdAt);
      return created ? created >= sevenDaysAgo : false;
    });

    const dailyMap = new Map<string, number>();
    for (const v of recentVerifications) {
      const d = safeDate(v.createdAt);
      if (!d) continue;
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
    }

    const verificationDaily = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    return response(200, {
      success: true,
      data: {
        totalUsers: usersResult.Count || 0,
        totalChallenges: challengesResult.Count || 0,
        totalParticipations: userChallengesResult.Count || 0,
        operations: {
          pendingReviewCount,
          rejectedCount,
          approvedCount,
          reviewTotal,
          reviewRejectRate: reviewTotal > 0 ? Number(((rejectedCount / reviewTotal) * 100).toFixed(1)) : 0,
        },
        verifications: {
          total: verifications.length,
          remedyCount,
          extraCount,
          recent7DaysCount: recentVerifications.length,
          verificationDaily,
        },
        timestamp: now.toISOString(),
      },
    });

  } catch (error: any) {
    console.error('Stats error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
