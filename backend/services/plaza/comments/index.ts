import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ANIMALS = ['🐰', '🐻', '🦊', '🐼', '🦁', '🐯', '🐨', '🦦'];

type QueryCursor = {
  lastEvaluatedKey?: Record<string, any>;
};

function decodeCursor(raw?: string): QueryCursor {
  if (!raw) return {};
  try {
    const json = Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  } catch {
    return {};
  }
}

function encodeCursor(cursor: QueryCursor | null): string | null {
  if (!cursor?.lastEvaluatedKey) return null;
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

function toAnimalIcon(seed: string): string {
  const sum = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return ANIMALS[sum % ANIMALS.length];
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const plazaPostId = event.pathParameters?.plazaPostId;
    if (!plazaPostId) return response(400, { message: 'plazaPostId required' });

    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;

    // HTTP API payload format v2 uses requestContext.http.method; v1 uses event.httpMethod
    const httpMethod = event.httpMethod || (event.requestContext as any)?.http?.method;

    if (httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const limit = Math.max(1, Math.min(100, Number(params.limit || '50')));
      const cursor = decodeCursor(params.cursor);

      const result = await ddb.send(new QueryCommand({
        TableName: process.env.PLAZA_COMMENTS_TABLE!,
        IndexName: 'plazaPostId-createdAt-index',
        KeyConditionExpression: 'plazaPostId = :plazaPostId',
        ExpressionAttributeValues: { ':plazaPostId': plazaPostId },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: cursor.lastEvaluatedKey,
      }));

      const hasMore = Boolean(result.LastEvaluatedKey);

      return response(200, {
        success: true,
        data: {
          comments: (result.Items || []).map((item: any) => ({
            commentId: item.commentId,
            animalIcon: item.animalIcon,
            content: item.content,
            createdAt: item.createdAt,
            isMine: Boolean(userId && item.userId === userId),
          })),
          hasMore,
          nextCursor: hasMore ? encodeCursor({ lastEvaluatedKey: result.LastEvaluatedKey }) : null,
        },
      });
    }

    if (!userId) return response(401, { message: 'UNAUTHORIZED' });

    const body = event.body ? JSON.parse(event.body) : {};
    const content = String(body.content || '').trim();
    if (!content) return response(400, { message: 'content required' });
    if (content.length > 300) return response(400, { message: 'content too long (max 300)' });

    const now = new Date().toISOString();
    const commentId = uuidv4();
    const animalIcon = toAnimalIcon(`${userId}:${plazaPostId}`);

    await ddb.send(new PutCommand({
      TableName: process.env.PLAZA_COMMENTS_TABLE!,
      Item: {
        commentId,
        plazaPostId,
        userId,
        animalIcon,
        content,
        createdAt: now,
      },
    }));

    await ddb.send(new UpdateCommand({
      TableName: process.env.PLAZA_POSTS_TABLE!,
      Key: { plazaPostId },
      UpdateExpression: 'SET commentCount = if_not_exists(commentCount, :zero) + :inc, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':inc': 1,
        ':zero': 0,
        ':updatedAt': now,
      },
    }));

    return response(200, {
      success: true,
      data: {
        commentId,
        animalIcon,
        content,
        createdAt: now,
      },
    });
  } catch (error: any) {
    console.error('Plaza comments error:', error);
    return response(500, {
      message: 'INTERNAL_SERVER_ERROR',
      error: error?.message || 'unknown error',
    });
  }
};
