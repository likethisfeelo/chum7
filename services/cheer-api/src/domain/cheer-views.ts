/**
 * 응원 조회 뷰/통계 순수 로직 — 레거시 get-my-cheers 응답 매핑 이식 (필드명 유지).
 * `day`는 cheer-latest.md 데이터 모델 추가분(additive)으로 함께 노출한다.
 */

export type CheerRecord = Record<string, any>;

/** 레거시 get-my-cheers 응답 필드 매핑 (동일 필드명 + day 추가) */
export function toCheerView(cheer: CheerRecord): Record<string, any> {
  return {
    cheerId: cheer.cheerId,
    type: cheer.cheerType,
    message: cheer.message ?? null,
    delta: cheer.senderDelta ?? null,
    day: cheer.day ?? null,
    scheduledTime: cheer.scheduledTime ?? null,
    status: cheer.status,
    isRead: cheer.isRead,
    readAt: cheer.readAt ?? null,
    isThankScoreGranted: cheer.isThankScoreGranted ?? false,
    thankScoreGrantedAt: cheer.thankScoreGrantedAt ?? null,
    thankMessage: cheer.thankMessage ?? null,
    thankMessageAt: cheer.thankMessageAt ?? null,
    replyMessage: cheer.replyMessage ?? null,
    repliedAt: cheer.repliedAt ?? null,
    createdAt: cheer.createdAt,
    sentAt: cheer.sentAt ?? null,
  };
}

/** 레거시 stats 계산 이식 */
export function computeCheerStats(cheers: CheerRecord[]): {
  total: number;
  immediate: number;
  scheduled: number;
  thankScoreGranted: number;
  unread: number;
} {
  return {
    total: cheers.length,
    immediate: cheers.filter((c) => c.cheerType === 'immediate').length,
    scheduled: cheers.filter((c) => c.cheerType === 'scheduled').length,
    thankScoreGranted: cheers.filter((c) => c.isThankScoreGranted).length,
    unread: cheers.filter((c) => !c.isRead).length,
  };
}

/** 예약 응원 목록 필터 — 레거시 get-scheduled의 `#status = :pending` 필터 대응 */
export function filterPendingScheduled(cheers: CheerRecord[]): CheerRecord[] {
  return cheers.filter((c) => c.cheerType === 'scheduled' && c.status === 'pending');
}

/** 예약 응원 목록 뷰 (레거시 get-scheduled 항목 필드) */
export function toScheduledView(cheer: CheerRecord): Record<string, any> {
  return {
    cheerId: cheer.cheerId,
    receiverId: cheer.receiverId,
    message: cheer.message ?? null,
    delta: cheer.senderDelta ?? null,
    day: cheer.day ?? null,
    scheduledTime: cheer.scheduledTime ?? null,
    status: cheer.status,
    createdAt: cheer.createdAt,
  };
}
