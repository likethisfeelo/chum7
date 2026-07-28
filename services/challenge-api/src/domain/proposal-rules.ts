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

/**
 * 재반려 가능 상태 — 이미 승인(자동승인 포함)된 제안만 리더가 다시 반려할 수 있다.
 * 반려 시 해당 참여자의 개인 퀘스트 인증 게시물을 삭제한다(호출부 처리).
 */
export function canRerejectProposal(status: unknown): boolean {
  return status === 'approved';
}

/**
 * 제안 자동승인 여부 — 기본 자동승인.
 * 챌린지가 `personalQuestAutoApprove === false` 로 명시적 수동검토(리더 검토 후 승인)를
 * 켠 경우에만 pending. 미설정(undefined)은 자동승인 — "기본 자동승인" 정책.
 */
export function shouldAutoApproveProposal(challenge: { personalQuestAutoApprove?: unknown } | null | undefined): boolean {
  return challenge?.personalQuestAutoApprove !== false;
}

export type ProposalDecision = 'approve' | 'reject';

export interface ProposalReviewOutcome {
  status: 'approved' | 'rejected';
  message: string;
}

/** 심사 결과 — 상태 갱신만 (승인 시 퀘스트 아이템 자동 생성 없음 — admin-api 와 동일 규칙) */
export function proposalReviewOutcome(decision: ProposalDecision): ProposalReviewOutcome {
  if (decision === 'approve') {
    return { status: 'approved', message: '개인 퀘스트 제안이 승인되었습니다' };
  }
  return { status: 'rejected', message: '개인 퀘스트 제안이 반려되었습니다. 참여자가 재제출할 수 있습니다.' };
}

/** updatedAt 최신순 정렬 후 가장 최근 제안 (레거시 my 핸들러 latestProposal 계약) */
export function sortProposalsLatestFirst<T extends { updatedAt?: unknown }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')),
  );
}
