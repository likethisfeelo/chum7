import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

type VerificationItem = Record<string, any>;

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

function isPublicVerification(v: VerificationItem): boolean {
  const isPublic = v.isPublic === 'true' || v.isPublic === true;
  const isPersonalOnly = v.isPersonalOnly === true;
  return isPublic && !isPersonalOnly;
}

function normalizeVerification(v: VerificationItem) {
  return {
    verificationId: v.verificationId,
    userId: v.userId,
    userName: v.userName || null,
    day: v.day,
    todayNote: v.todayNote,
    imageUrl: v.imageUrl || null,
    isAnonymous: Boolean(v.isAnonymous),
    isExtra: Boolean(v.isExtra),
    isPersonalOnly: Boolean(v.isPersonalOnly),
    cheerCount: v.cheerCount || 0,
    createdAt: v.createdAt,
    certDate: v.certDate || v.verificationDate || null,
    scoreEarned: v.scoreEarned ?? v.score ?? 0
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;

    const query = event.queryStringParameters || {};
    const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
    const isPublic = query.isPublic === 'true';
    const mine = query.mine === 'true';
    const isExtra = query.isExtra;
    const nextToken = query.nextToken;

    let startKey: Record<string, any> | undefined;
    if (nextToken) {
      try {
        startKey = JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'));
      } catch {
        return response(400, {
          error: 'INVALID_NEXT_TOKEN',
          message: 'nextToken 형식이 올바르지 않습니다'
        });
      }
    }

    const result = await docClient.send(new ScanCommand({
      TableName: process.env.VERIFICATIONS_TABLE!,
      Limit: 500,
      ExclusiveStartKey: startKey
    }));

    const items = (result.Items || []).filter((v: VerificationItem) => {
      if (mine) {
        if (!userId) return false;
        if (v.userId !== userId) return false;
      }

      if (isPublic && !isPublicVerification(v)) {
        return false;
      }

      if (isExtra === 'true' && !v.isExtra) return false;
      if (isExtra === 'false' && v.isExtra) return false;

      return true;
    });

    items.sort((a: VerificationItem, b: VerificationItem) => {
      const at = new Date(a.createdAt || 0).getTime();
      const bt = new Date(b.createdAt || 0).getTime();
      return bt - at;
    });

    const sliced = items.slice(0, limit).map(normalizeVerification);
    const newNextToken = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey), 'utf-8').toString('base64')
      : null;

    return response(200, {
      success: true,
      data: {
        verifications: sliced,
        count: sliced.length,
        nextToken: newNextToken
      }
    });
  } catch (error: any) {
    console.error('List verification error:', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
