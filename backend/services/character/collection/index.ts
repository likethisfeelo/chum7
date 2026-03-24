import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../../shared/lib/dynamodb-client';
import { response } from '../../../shared/lib/api-response';

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) return response(401, { error: 'UNAUTHORIZED' });

    const res = await docClient.send(new QueryCommand({
      TableName: process.env.CHARACTERS_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ProjectionExpression:
        'characterId, mythologyLine, characterType, filledCount, #st, createdAt, completedAt',
      ExpressionAttributeNames: { '#st': 'status' },
    }));

    const characters = res.Items ?? [];

    // 완성된 것: 중복 수 포함 모두 반환
    // 진행 중인 것: 최대 1개
    const completed = characters.filter((c: any) => c.status === 'complete');
    const inProgress = characters.filter((c: any) => c.status === 'in_progress');

    // 완성 캐릭터별 보유 수 집계
    const countByType: Record<string, number> = {};
    for (const c of completed) {
      const t = c.characterType as string;
      countByType[t] = (countByType[t] ?? 0) + 1;
    }

    return response(200, {
      success: true,
      data: {
        completed: completed.map((c: any) => ({
          characterId: c.characterId,
          mythologyLine: c.mythologyLine,
          characterType: c.characterType,
          count: countByType[c.characterType],
          completedAt: c.completedAt ?? null,
        })),
        inProgress: inProgress.map((c: any) => ({
          characterId: c.characterId,
          mythologyLine: c.mythologyLine,
          characterType: c.characterType,
          filledCount: c.filledCount ?? 0,
        })),
      },
    });
  } catch (err) {
    console.error('[character/collection] error:', err);
    return response(500, { error: 'INTERNAL_ERROR' });
  }
};
