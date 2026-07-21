/**
 * 스케줄러 통계 증분 규칙 (순수 로직) — cheer-api의 stats-rules와 동일한 STATS#<userId>/META
 * 카운터를 증분한다 (크로스 서비스 import 금지 원칙에 따라 서비스별 자체 보유).
 * 반영 시점: 조건부 상태 전이(pending→sent / pending→receiver_completed)가 실제 성공한 뒤에만.
 */

export type SchedulerStatField = 'receivedCount' | 'thankScoreEarned' | 'receiverCompletedCount';

/** 한 사용자의 STATS 아이템에 적용할 증분 */
export interface StatsIncrement {
  userId: string;
  add: Partial<Record<SchedulerStatField, number>>;
}

/** 예약 응원 발송(status=sent 전이 성공): 수신자 receivedCount +1 */
export function onScheduledCheerSent(receiverId: string): StatsIncrement[] {
  if (!receiverId) return [];
  return [{ userId: receiverId, add: { receivedCount: 1 } }];
}

/**
 * 수신자 선완료(status=receiver_completed 전이 성공): 발신자 thankScoreEarned +1
 * (challenges 참여 아이템 thankScore ADD 미러) + receiverCompletedCount +1.
 */
export function onReceiverCompleted(senderId: string): StatsIncrement[] {
  if (!senderId) return [];
  return [{ userId: senderId, add: { thankScoreEarned: 1, receiverCompletedCount: 1 } }];
}
