import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function response(statusCode: number, body: any): APIGatewayProxyResult {
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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!userId) return response(401, { message: 'UNAUTHORIZED' });

    const body = event.body ? JSON.parse(event.body) : {};
    const plazaPostId = event.pathParameters?.plazaPostId || body.verificationId;
    if (!plazaPostId) return response(400, { message: 'plazaPostId(or verificationId) required' });

    const verificationsTable = process.env.VERIFICATIONS_TABLE!;
    const postsTable = process.env.PLAZA_POSTS_TABLE!;
    const reactionsTable = process.env.PLAZA_REACTIONS_TABLE!;

    const now = new Date().toISOString();
    const reactionId = `${plazaPostId}#${userId}`;

    const postRes = await ddb.send(new GetCommand({
      TableName: postsTable,
      Key: { plazaPostId },
    }));
    const post = postRes.Item;

    const verificationId = body.verificationId || post?.sourceId || plazaPostId;
    let verification: any = null;
    if (verificationId) {
      const verificationRes = await ddb.send(new GetCommand({
        TableName: verificationsTable,
        Key: { verificationId },
      }));
      verification = verificationRes.Item;
    }

    const challengeId = body.challengeId || post?.sourceChallengeId || verification?.challengeId || null;
    const challengeTitle = post?.challengeTitle || verification?.challengeTitle || null;

    await ddb.send(new PutCommand({
      TableName: reactionsTable,
      Item: {
        reactionId,
        plazaPostId,
        userId,
        reactionType: body.reactionType || 'like',
        challengeId,
        createdAt: now,
      },
    }));

    const countRes = await ddb.send(new QueryCommand({
      TableName: reactionsTable,
      IndexName: 'plazaPostId-index',
      KeyConditionExpression: 'plazaPostId = :plazaPostId',
      ExpressionAttributeValues: { ':plazaPostId': plazaPostId },
      Select: 'COUNT',
    }));
    const likeCount = countRes.Count || 0;

    if (post) {
      await ddb.send(new UpdateCommand({
        TableName: postsTable,
        Key: { plazaPostId },
        UpdateExpression: 'SET likeCount = :likeCount, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':likeCount': likeCount,
          ':updatedAt': now,
        },
      }));
    } else if (verificationId) {
      await ddb.send(new UpdateCommand({
        TableName: verificationsTable,
        Key: { verificationId },
        UpdateExpression: 'SET likeCount = :likeCount, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':likeCount': likeCount,
          ':updatedAt': now,
        },
      }));
    }

    const recommendation = challengeId
      ? {
          recommendationId: `${userId}#${challengeId}`,
          challengeId,
          challengeTitle: challengeTitle || '추천 챌린지',
          isRecruiting: true,
          message: '방금 공감한 기록이 이 챌린지에서 나왔어요.',
        }
      : null;

    return response(200, {
      success: true,
      data: {
        likeCount,
        myReaction: 'like',
        recommendation,
      },
    });
  } catch (error: any) {
    console.error('Plaza react error:', error);
    return response(500, {
      message: 'INTERNAL_SERVER_ERROR',
      error: error?.message || 'unknown error',
    });
  }
};
