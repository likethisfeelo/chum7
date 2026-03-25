import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { response, getUserId, wasParticipant, decodeNextToken, encodeNextToken, createPersistentAnonymousId } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserId(event);
    const challengeId = event.pathParameters?.challengeId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다.' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });

    const participant = await wasParticipant(client, challengeId, userId);
    if (!participant) {
      return response(403, { error: 'FORBIDDEN', message: '참여자만 댓글을 열람할 수 있습니다.' });
    }

    // 챌린지 종료 여부 확인 (completed이면 일일 익명 → 안정적 익명 공개)
    const challengeResult = await client.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      ProjectionExpression: 'lifecycle',
    }));
    const challengeCompleted = challengeResult.Item?.lifecycle === 'completed';

    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20', 10), 50);
    let exclusiveStartKey;
    try {
      exclusiveStartKey = decodeNextToken(event.queryStringParameters?.nextToken);
    } catch {
      return response(400, { error: 'INVALID_NEXT_TOKEN' });
    }

    const result = await client.send(new QueryCommand({
      TableName: process.env.CHALLENGE_COMMENTS_TABLE!,
      IndexName: 'challengeId-createdAt-index',
      KeyConditionExpression: 'challengeId = :challengeId',
      ExpressionAttributeValues: { ':challengeId': challengeId },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }));

    const setSize = (s: any): number => {
      if (!s) return 0;
      if (s instanceof Set) return s.size;
      if (Array.isArray(s)) return s.length;
      return 0;
    };
    const setHas = (s: any, v: string): boolean => {
      if (!s) return false;
      if (s instanceof Set) return s.has(v);
      if (Array.isArray(s)) return s.includes(v);
      return false;
    };

    const comments = (result.Items ?? []).map((item: any) => {
      const dailyAnonymousId = item.dailyAnonymousId ?? '익명-000';
      const displayName = (challengeCompleted && item.userId)
        ? createPersistentAnonymousId(challengeId, item.userId)
        : dailyAnonymousId;
      return ({
      commentId: item.commentId,
      challengeId: item.challengeId,
      dailyAnonymousId: displayName,
      isRevealed: challengeCompleted,
      content: item.content,
      isQuoted: !!item.isQuoted,
      quotedAt: item.quotedAt ?? null,
      createdAt: item.createdAt,
      parentCommentId: item.parentCommentId ?? null,
      reactions: {
        '❤️': setSize(item.reaction_heart),
        '🔥': setSize(item.reaction_fire),
        '👏': setSize(item.reaction_clap),
      },
      myReactions: [
        ...(setHas(item.reaction_heart, userId) ? ['❤️'] : []),
        ...(setHas(item.reaction_fire, userId) ? ['🔥'] : []),
        ...(setHas(item.reaction_clap, userId) ? ['👏'] : []),
      ],
    });
    });

    return response(200, {
      comments,
      challengeCompleted,
      nextToken: encodeNextToken(result.LastEvaluatedKey as Record<string, unknown> | undefined),
      hasMore: !!result.LastEvaluatedKey,
    });
  } catch (error) {
    console.error('get-comments error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
