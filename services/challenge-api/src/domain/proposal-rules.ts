/**
 * 개인 퀘스트 제안 상태 규칙 — 순수 로직 (AWS 무의존).
 * 레거시: backend/services/challenge/personal-quest/{submit,my} 의 상태 전이를 v1 로 단순화
 * (pending → approved | rejected, 반려 후 재제출은 pending 으로 복귀).
 * revision_pending/expired(수정 횟수 상한) 플로우는 v1 범위 밖 — PORTING.md 참고.
 */

export type ProposalStatus = 'pending' | 'approved' | 'rejected';

/** 제안 제출 가능한 챌린지 라이프사이클 (레거시 submit 가드 승계) */
export function canProposeInLifecycle(lifecycle: unknown): boolean {
  return lifecycle === 'recruiting' || lifecycle === 'preparing';
}

export interface SubmitDecision {
  allowed: boolean;
  /** 기존 제안을 갱신(upsert)할지, 새 제안을 만들지 */
  mode: 'create' | 'update';
  errorCode?: 'ALREADY_APPROVED';
}

/**
 * 제출 판정 (레거시 submit 의 activeProposal upsert 의미 승계):
 *  - 기존 제안 없음 → 신규 생성 (pending)
 *  - pending / rejected → 기존 아이템을 최신 내용 + pending 으로 갱신 (재제출)
 *  - approved → 재제출 불가 (이미 승인된 제안 존재)
 */
export function decideSubmit(existingStatus: ProposalStatus | undefined): SubmitDecision {
  if (existingStatus === undefined) return { allowed: true, mode: 'create' };
  if (existingStatus === 'approved') {
    return { allowed: false, mode: 'update', errorCode: 'ALREADY_APPROVED' };
  }
  return { allowed: true, mode: 'update' };
}

/** pending 상태만 심사 가능 (레거시 ALREADY_REVIEWED 가드 — admin-api 와 동일 규칙) */
export function canReviewProposal(status: unknown): boolean {
  return status === 'pending';
}

/** updatedAt 최신순 정렬 후 가장 최근 제안 (레거시 my 핸들러 latestProposal 계약) */
export function sortProposalsLatestFirst<T extends { updatedAt?: unknown }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')),
  );
}
