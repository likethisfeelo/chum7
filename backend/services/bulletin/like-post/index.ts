/**
 * POST /bulletin/{challengeId}/posts/{postId}/like
 * 게시글 좋아요 토글 (누르면 추가, 다시 누르면 취소).
 *
 * 중복 방지: bulletinLikes 테이블에 `${postId}#${userId}` 조합 유니크 키 사용.
 * DynamoDB conditional write로 원자적 처리.
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const challengeId = event.pathParameters?.challengeId;
    const postId = event.pathParameters?.postId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    if (!postId) return response(400, { error: 'MISSING_POST_ID' });

    // 게시글 존재 확인
    const postResult = await docClient.send(new GetCommand({
      TableName: process.env.BULLETIN_POSTS_TABLE!,
      Key: { postId },
    }));
    if (!postResult.Item || postResult.Item.isDeleted) {
      return response(404, { error: 'POST_NOT_FOUND', message: '게시글을 찾을 수 없습니다' });
    }

    const likeId = `${postId}#${userId}`;

    // 현재 좋아요 상태 확인
    const likeResult = await docClient.send(new GetCommand({
      TableName: process.env.BULLETIN_LIKES_TABLE!,
      Key: { likeId },
    }));

    const now = new Date().toISOString();
    const alreadyLiked = !!likeResult.Item;

    if (alreadyLiked) {
      // 좋아요 취소
      await docClient.send(new DeleteCommand({
        TableName: process.env.BULLETIN_LIKES_TABLE!,
        Key: { likeId },
      }));
      await docClient.send(new UpdateCommand({
        TableName: process.env.BULLETIN_POSTS_TABLE!,
        Key: { postId },
        UpdateExpression: 'SET likeCount = if_not_exists(likeCount, :zero) - :dec, updatedAt = :now',
        ConditionExpression: 'likeCount > :zero',
        ExpressionAttributeValues: { ':dec': 1, ':zero': 0, ':now': now },
      }));
      return response(200, { success: true, liked: false, message: '좋아요를 취소했습니다' });
    } else {
      // 좋아요 추가
      await docClient.send(new PutCommand({
        TableName: process.env.BULLETIN_LIKES_TABLE!,
        Item: {
          likeId,
          postId,
          userId,
          createdAt: now,
        },
        ConditionExpression: 'attribute_not_exists(likeId)',
      }));
      await docClient.send(new UpdateCommand({
        TableName: process.env.BULLETIN_POSTS_TABLE!,
        Key: { postId },
        UpdateExpression: 'SET likeCount = if_not_exists(likeCount, :zero) + :inc, updatedAt = :now',
        ExpressionAttributeValues: { ':inc': 1, ':zero': 0, ':now': now },
      }));
      return response(200, { success: true, liked: true, message: '좋아요를 눌렀습니다' });
    }

  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      // 동시 요청 경쟁 조건 - 그냥 성공으로 처리
      return response(200, { success: true, message: '처리되었습니다' });
    }
    console.error('Like post error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
