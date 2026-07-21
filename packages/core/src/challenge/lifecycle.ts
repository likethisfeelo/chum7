/**
 * 챌린지 라이프사이클 상태 머신 (PRODUCT_SPEC §4.1).
 * 순수 함수만 — AWS 의존 금지. 기존 backend/shared/lib/challenge-state.ts 의미를 승계하되
 * 전이 규칙을 명시적 표로 고정한다.
 */
export type ChallengeLifecycle =
  | 'draft'
  | 'recruiting'
  | 'preparing'
  | 'active'
  | 'completed'
  | 'archived';

export type ChallengeBucket = 'active' | 'preparing' | 'completed' | 'other';

const TRANSITIONS: Record<ChallengeLifecycle, readonly ChallengeLifecycle[]> = {
  draft: ['recruiting', 'archived'],
  recruiting: ['preparing', 'active', 'archived'],
  preparing: ['active', 'archived'],
  active: ['completed'],
  completed: ['archived'],
  archived: [],
};

export function canTransition(from: ChallengeLifecycle, to: ChallengeLifecycle): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface LifecycleClockInput {
  lifecycle: ChallengeLifecycle;
  /** 'YYYY-MM-DD' — 챌린지 시작일 */
  startDate?: string;
  durationDays: number;
  /** 'YYYY-MM-DD' — 판정 기준일 (호출자가 타임존 계산 후 전달) */
  today: string;
}

/**
 * 시간 경과에 따라 도달해야 할 라이프사이클을 계산한다 (lifecycle-manager 워커의 핵심 룰).
 * draft/archived 는 시간이 전이시키지 않는다.
 */
export function resolveDueLifecycle(input: LifecycleClockInput): ChallengeLifecycle {
  const { lifecycle, startDate, durationDays, today } = input;
  if (lifecycle === 'draft' || lifecycle === 'archived' || !startDate) return lifecycle;

  if (today < startDate) {
    return lifecycle === 'recruiting' ? 'recruiting' : 'preparing';
  }
  const elapsed = dayDiff(startDate, today); // 시작일 = 0
  if (elapsed < durationDays) return 'active';
  return 'completed';
}

/** 사용자 화면용 4버킷 분류 (PRODUCT_SPEC §4.1 / 기존 resolveChallengeBucket 승계) */
export function resolveBucket(lifecycle: ChallengeLifecycle): ChallengeBucket {
  switch (lifecycle) {
    case 'active':
      return 'active';
    case 'recruiting':
    case 'preparing':
      return 'preparing';
    case 'completed':
    case 'archived':
      return 'completed';
    case 'draft':
      return 'other';
  }
}

/** 시작일 기준 캘린더 Day 계산 (Day 1..durationDays, 표시용 — currentDay 저장값 사용 금지) */
export function calendarDay(startDate: string, today: string, durationDays: number): number {
  const d = dayDiff(startDate, today) + 1;
  return Math.max(1, Math.min(d, durationDays));
}

function dayDiff(fromYmd: string, toYmd: string): number {
  const from = Date.UTC(
    Number(fromYmd.slice(0, 4)),
    Number(fromYmd.slice(5, 7)) - 1,
    Number(fromYmd.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(toYmd.slice(0, 4)),
    Number(toYmd.slice(5, 7)) - 1,
    Number(toYmd.slice(8, 10)),
  );
  return Math.round((to - from) / 86_400_000);
}
