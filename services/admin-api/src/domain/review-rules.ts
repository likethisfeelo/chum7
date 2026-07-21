/**
 * 퀘스트 제출물 심사 규칙 — 레거시 quest/approve 순수 로직 이식.
 *  승인: 이력 status='approved' + rewardGranted, ACTIVE 마커 status='approved' 유지(재제출 차단),
 *        quest.approvedCount += 1
 *  거절: 이력 status='rejected', ACTIVE 마커 삭제(재제출 허용 — challenge-api PORTING.md §C 계약)
 */

export type ReviewAction = 'approve' | 'reject';

export interface ReviewOutcome {
  status: 'approved' | 'rejected';
  rewardGranted: boolean;
  canResubmit: boolean;
  message: string;
}

/** pending 상태만 심사 가능 (레거시 ALREADY_REVIEWED 가드 승계) */
export function canReviewSubmission(status: unknown): boolean {
  return status === 'pending';
}

export function reviewOutcome(action: ReviewAction): ReviewOutcome {
  if (action === 'approve') {
    return {
      status: 'approved',
      rewardGranted: true,
      canResubmit: false,
      message: '제출물이 승인되었습니다',
    };
  }
  return {
    status: 'rejected',
    rewardGranted: false,
    canResubmit: true,
    message: '제출물이 거절되었습니다. 사용자가 재제출할 수 있습니다.',
  };
}

/** 제출물 status 필터 매칭 — 'approved' 필터는 auto_approved 포함 (레거시 admin-list 승계) */
export function matchesStatusFilter(itemStatus: unknown, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'approved') return itemStatus === 'approved' || itemStatus === 'auto_approved';
  return itemStatus === filter;
}

/** 심사 목록 요약 집계 (레거시 admin-list summary 승계) */
export function summarizeSubmissions(
  items: Array<{ status?: unknown; quest?: { questScope?: unknown } | null }>,
): { byStatus: Record<string, number>; byScope: Record<string, number> } {
  const byStatus: Record<string, number> = {};
  const byScope: Record<string, number> = {};
  for (const item of items) {
    const status = String(item.status ?? 'unknown');
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const scope = String(item.quest?.questScope ?? 'unknown');
    byScope[scope] = (byScope[scope] ?? 0) + 1;
  }
  return { byStatus, byScope };
}
