import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../../shared/lib/dynamodb-client';
import { response } from '../../../shared/lib/api-response';

const LAYER_ORDER = [
  { category: 'health',       floor: 'B2', label: 'Selflove'   },
  { category: 'mindfulness',  floor: 'B1', label: 'Attitude'   },
  { category: 'habit',        floor: 'G1', label: 'Discipline' },
  { category: 'relationship', floor: 'G2', label: 'Build'      },
  { category: 'creativity',   floor: 'G3', label: 'Explore'    },
  { category: 'development',  floor: 'G4', label: 'Create'     },
  { category: 'expand',       floor: 'G5', label: 'Expand'     },
  { category: 'impact',       floor: 'G6', label: 'Impact'     },
] as const;

/** KST 기준 오늘 00:00 ~ 23:59:59 의 UTC ISO 범위 반환 */
function getKstTodayRange(): { start: string; end: string } {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = kstNow.toISOString().slice(0, 10);
  return {
    start: new Date(`${dateStr}T00:00:00+09:00`).toISOString(),
    end:   new Date(`${dateStr}T23:59:59+09:00`).toISOString(),
  };
}

type CategoryKey = typeof LAYER_ORDER[number]['category'];

interface CategoryAgg {
  questScore: number;
  cheerScore: number;
  thankScore: number;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) return response(401, { error: 'UNAUTHORIZED' });

    const ucTable  = process.env.USER_CHALLENGES_TABLE!;
    const chTable  = process.env.CHALLENGES_TABLE!;
    const verTable = process.env.VERIFICATIONS_TABLE!;

    // ── 1. userChallenges 전체 조회 ──────────────────────────────────
    const ucItems: any[] = [];
    let ucLEK: Record<string, any> | undefined;
    do {
      const res = await docClient.send(new QueryCommand({
        TableName: ucTable,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
        ProjectionExpression: 'challengeId, #sc, cheerScore, thankScore',
        ExpressionAttributeNames: { '#sc': 'score' },
        ExclusiveStartKey: ucLEK,
      }));
      ucItems.push(...(res.Items ?? []));
      ucLEK = res.LastEvaluatedKey;
    } while (ucLEK);

    // ── 2. challenges BatchGet → category 맵 ─────────────────────────
    const challengeIds = [...new Set(
      ucItems.map((uc: any) => uc.challengeId).filter((id): id is string => Boolean(id)),
    )];

    const categoryMap: Record<string, string> = {};
    for (let i = 0; i < challengeIds.length; i += 100) {
      const chunk = challengeIds.slice(i, i + 100);
      const batchRes = await docClient.send(new BatchGetCommand({
        RequestItems: {
          [chTable]: {
            Keys: chunk.map(id => ({ challengeId: id })),
            ProjectionExpression: 'challengeId, category',
          },
        },
      }));
      for (const item of (batchRes.Responses?.[chTable] ?? [])) {
        if (item.challengeId && item.category) {
          categoryMap[item.challengeId as string] = item.category as string;
        }
      }
    }

    // ── 3. 카테고리별 점수 집계 ──────────────────────────────────────
    const agg: Record<string, CategoryAgg> = {};
    for (const uc of ucItems) {
      const cat = categoryMap[uc.challengeId as string];
      if (!cat) continue;
      if (!agg[cat]) agg[cat] = { questScore: 0, cheerScore: 0, thankScore: 0 };
      agg[cat].questScore  += typeof uc.score      === 'number' ? uc.score      : 0;
      agg[cat].cheerScore  += typeof uc.cheerScore === 'number' ? uc.cheerScore : 0;
      agg[cat].thankScore  += typeof uc.thankScore === 'number' ? uc.thankScore : 0;
    }

    // ── 4. 오늘 quest delta (verifications, KST 오늘, score=1) ──────
    const { start, end } = getKstTodayRange();
    const todayDelta: Record<string, number> = {};
    let verLEK: Record<string, any> | undefined;
    do {
      const res = await docClient.send(new QueryCommand({
        TableName: verTable,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :uid AND createdAt BETWEEN :s AND :e',
        FilterExpression: '#sc = :one',
        ExpressionAttributeNames: { '#sc': 'score' },
        ExpressionAttributeValues: {
          ':uid': userId,
          ':s': start,
          ':e': end,
          ':one': 1,
        },
        ProjectionExpression: 'challengeCategory',
        ExclusiveStartKey: verLEK,
      }));
      for (const v of (res.Items ?? [])) {
        const cat = v.challengeCategory as string;
        if (cat) todayDelta[cat] = (todayDelta[cat] ?? 0) + 1;
      }
      verLEK = res.LastEvaluatedKey;
    } while (verLEK);

    // ── 5. 응답 구성 ─────────────────────────────────────────────────
    const layers = LAYER_ORDER.map(l => {
      const s = agg[l.category] ?? { questScore: 0, cheerScore: 0, thankScore: 0 };
      return {
        category:         l.category as CategoryKey,
        floor:            l.floor,
        label:            l.label,
        questScore:       Math.min(100, s.questScore),
        cheerScore:       s.cheerScore,
        thankScore:       s.thankScore,
        todayQuestDelta:  todayDelta[l.category] ?? 0,
      };
    });

    const totals = layers.reduce(
      (acc, l) => ({
        questScore:  acc.questScore  + l.questScore,
        cheerScore:  acc.cheerScore  + l.cheerScore,
        thankScore:  acc.thankScore  + l.thankScore,
      }),
      { questScore: 0, cheerScore: 0, thankScore: 0 },
    );

    return response(200, { success: true, data: { layers, totals } });
  } catch (err) {
    console.error('[world-summary] error:', err);
    return response(500, { error: 'INTERNAL_ERROR' });
  }
};
