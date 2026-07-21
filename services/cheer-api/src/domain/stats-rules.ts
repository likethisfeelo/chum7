/**
 * 응원 통계 증분 규칙 (순수 로직) — 레거시 cheer-stats-materializer(풀스캔 배치) 대체.
 * 액션별 카운터 델타만 계산하고, 실제 DynamoDB ADD 반영은 repo/stats.ts가 수행한다.
 *
 * 레거시 필드 매핑 (materializer StatsRecord → 증분 카운터):
 *   sentCount → sentCount / receivedCount → receivedCount / repliedCount → replyCount /
 *   reactionCount → reactionGivenCount(리액션 준 쪽) + reactionReceivedCount(받은 쪽) 분리 /
 *   thankedCount → thankedCount / immediateCount·scheduledCount → 폐기 (PORTING.md §5).
 * 신규: thankScoreEarned·receiverCompletedCount (스케줄러 receiver_completed 전이 — 참여 thankScore 미러).
 */

export const STAT_FIELDS = [
  'sentCount',
  'receivedCount',
  'reactionGivenCount',
  'reactionReceivedCount',
  'replyCount',
  'thankedCount',
  'thankScoreEarned',
  'receiverCompletedCount',
] as const;

export type StatField = (typeof STAT_FIELDS)[number];
export type StatsDelta = Partial<Record<StatField, number>>;

/** 한 사용자의 STATS#<userId>/META 아이템에 적용할 증분 */
export interface StatsIncrement {
  userId: string;
  add: StatsDelta;
}

export function emptyStats(): Record<StatField, number> {
  const stats = {} as Record<StatField, number>;
  for (const field of STAT_FIELDS) stats[field] = 0;
  return stats;
}

function toNonNegativeInt(value: unknown): number {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return 0;
  return Math.max(0, Math.floor(asNumber));
}

/** STATS 아이템(부재 가능) → 0 채움 정규화 뷰 — 레거시 stats API의 buildStatsSummaryFromItem 승계 */
export function toStatsView(item: Record<string, any> | undefined): Record<StatField, number> {
  const stats = emptyStats();
  if (!item) return stats;
  for (const field of STAT_FIELDS) stats[field] = toNonNegativeInt(item[field]);
  return stats;
}

/** 응원 생성: 발신자 sentCount +1, 즉시 발송(status=sent 생성)이면 수신자 receivedCount +1 */
export function onCheerCreated(params: {
  senderId: string;
  receiverId: string;
  isImmediate: boolean;
}): StatsIncrement[] {
  const increments: StatsIncrement[] = [{ userId: params.senderId, add: { sentCount: 1 } }];
  if (params.isImmediate) {
    increments.push({ userId: params.receiverId, add: { receivedCount: 1 } });
  }
  return increments;
}

/** 리액션: 리액션한 수신자 reactionGivenCount +1, 응원 발신자 reactionReceivedCount +1 */
export function onReactionGiven(params: {
  senderId?: string | null;
  receiverId: string;
}): StatsIncrement[] {
  const increments: StatsIncrement[] = [
    { userId: params.receiverId, add: { reactionGivenCount: 1 } },
  ];
  if (params.senderId && params.senderId !== params.receiverId) {
    increments.push({ userId: params.senderId, add: { reactionReceivedCount: 1 } });
  }
  return increments;
}

/** 답장: 답장한 수신자 replyCount +1 (레거시 repliedCount는 수신 관점 집계) */
export function onReplyGiven(params: { receiverId: string }): StatsIncrement[] {
  return [{ userId: params.receiverId, add: { replyCount: 1 } }];
}

/** 감사 메시지: 발신자 thankedCount +성공건수 (isThanked 마킹된 응원 수 — 레거시 thankedCount) */
export function onThankSent(params: { senderId: string; updatedCount: number }): StatsIncrement[] {
  const count = toNonNegativeInt(params.updatedCount);
  if (count === 0) return [];
  return [{ userId: params.senderId, add: { thankedCount: count } }];
}
