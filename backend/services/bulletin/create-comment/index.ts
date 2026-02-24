/**
 * POST /bulletin/{challengeId}/posts/{postId}/comments
 * 게시글에 댓글을 작성한다.
 *
 * content: string (최대 500자)
 * 게시판 형태이므로 댓글은 1단 depth만 지원 (답글 없음).
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const createCommentSchema = z.object({
  content: z.string().min(1).max(500),
});

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub || event.queryStringParameters?.userId;
    const postId = event.pathParameters?.postId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    if (!postId) return response(400, { error: 'MISSING_POST_ID' });

    const body = JSON.parse(event.body || '{}');
    const input = createCommentSchema.parse(body);

    // 게시글 존재 확인
    const postResult = await docClient.send(new GetCommand({
      TableName: process.env.BULLETIN_POSTS_TABLE!,
      Key: { postId },
    }));
    if (!postResult.Item || postResult.Item.isDeleted) {
      return response(404, { error: 'POST_NOT_FOUND', message: '게시글을 찾을 수 없습니다' });
    }

    const commentId = uuidv4();
    const now = new Date().toISOString();

    const comment = {
      commentId,
      postId,
      userId,
      content: input.content,
      isDeleted: false,
      createdAt: now,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.BULLETIN_COMMENTS_TABLE!,
      Item: comment,
    }));

    // 게시글 commentCount 증가
    await docClient.send(new UpdateCommand({
      TableName: process.env.BULLETIN_POSTS_TABLE!,
      Key: { postId },
      UpdateExpression: 'SET commentCount = if_not_exists(commentCount, :zero) + :inc, updatedAt = :now',
      ExpressionAttributeValues: { ':inc': 1, ':zero': 0, ':now': now },
    }));

    return response(201, {
      success: true,
      message: '댓글이 작성되었습니다',
      data: comment,
    });

  } catch (error: any) {
    console.error('Create bulletin comment error:', error);
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', details: error.errors });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
