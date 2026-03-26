import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { response, getUserId } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserId(event);
    const commentId = event.pathParameters?.commentId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED' });
    if (!commentId) return response(400, { error: 'MISSING_COMMENT_ID' });

    const existing = await client.send(new GetCommand({
      TableName: process.env.VERIFICATION_COMMENTS_TABLE!,
      Key: { commentId },
    }));
    if (!existing.Item) return response(404, { error: 'COMMENT_NOT_FOUND' });
    if (existing.Item.userId !== userId) return response(403, { error: 'FORBIDDEN', message: '본인 댓글만 삭제할 수 있습니다.' });

    await client.send(new DeleteCommand({
      TableName: process.env.VERIFICATION_COMMENTS_TABLE!,
      Key: { commentId },
    }));

    return response(200, { data: { deleted: true, commentId } });
  } catch (err) {
    console.error('delete-verification-comment error', err);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
