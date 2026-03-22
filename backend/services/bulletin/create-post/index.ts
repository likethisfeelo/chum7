/**
 * POST /bulletin/{challengeId}/posts
 * 챌린지 준비/진행 단계 게시판에 글을 작성한다.
 *
 * phase 별 접근 제어:
 *   - preparing : 챌린지 참여자(recruiting phase 이후 포함)만 작성 가능
 *   - active    : 챌린지 진행 참여자만 작성 가능
 *
 * content:
 *   - text      : 필수, 최대 2000자
 *   - imageUrls : 선택, S3 URL 배열 (최대 4장)
 *   - linkUrl   : 선택 (링크 미리보기는 클라이언트에서 처리)
 *   - linkTitle : 선택
 *
 * challengePhaseKey = `${challengeId}#${phase}` → GSI PK로 게시판 피드 조회
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const createPostSchema = z.object({
  content: z.object({
    text: z.string().min(1).max(2000),
    imageUrls: z.array(z.string().url()).max(4).default([]),
    linkUrl: z.string().url().optional().nullable(),
    linkTitle: z.string().max(100).optional().nullable(),
  }),
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
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const challengeId = event.pathParameters?.challengeId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });

    const body = JSON.parse(event.body || '{}');
    const input = createPostSchema.parse(body);

    // 1. 챌린지 현재 lifecycle 조회
    const challengeResult = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));
    if (!challengeResult.Item) {
      return response(404, { error: 'CHALLENGE_NOT_FOUND', message: '챌린지를 찾을 수 없습니다' });
    }

    const challenge = challengeResult.Item;
    const lifecycle = challenge.lifecycle;

    // 게시판이 활성화되는 단계: preparing, active
    if (!['preparing', 'active'].includes(lifecycle)) {
      return response(409, {
        error: 'BULLETIN_UNAVAILABLE',
        message: '현재 게시판이 활성화되지 않은 챌린지입니다',
        lifecycle,
      });
    }

    // 2. 사용자가 이 챌린지에 참여 중인지 확인
    const ucResult = await docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'challengeId = :cid AND #status <> :failed',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':uid': userId,
        ':cid': challengeId,
        ':failed': 'failed',
      },
    }));

    if (!ucResult.Items || ucResult.Items.length === 0) {
      return response(403, {
        error: 'NOT_PARTICIPANT',
        message: '챌린지 참여자만 게시판에 글을 작성할 수 있습니다',
      });
    }

    const phase = lifecycle as 'preparing' | 'active';
    const challengePhaseKey = `${challengeId}#${phase}`;
    const postId = uuidv4();
    const now = new Date().toISOString();

    const post = {
      postId,
      challengeId,
      userId,
      phase,
      challengePhaseKey,
      content: {
        text: input.content.text,
        imageUrls: input.content.imageUrls,
        linkUrl: input.content.linkUrl ?? null,
        linkTitle: input.content.linkTitle ?? null,
      },
      likeCount: 0,
      commentCount: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.BULLETIN_POSTS_TABLE!,
      Item: post,
    }));

    return response(201, {
      success: true,
      message: '게시글이 작성되었습니다',
      data: post,
    });

  } catch (error: any) {
    console.error('Create bulletin post error:', error);
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', details: error.errors });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
