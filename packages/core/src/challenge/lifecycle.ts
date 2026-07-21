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

// ── 스케줄 인지 라이프사이클 (시간 문제 개선판) ─────────────────────────────
//
// 규칙 (docs/time-policy.md):
//  R1. 자동 전이는 앞으로만 간다 (forward-only). 수동으로 먼저 전이했다면
//      지나간 예약 시각은 영구히 no-op이다 (뒤로 되돌리지 않음).
//  R2. 모집 오픈(recruitOpenAt)·모집 마감(recruitCloseAt)은 "시각" 비교,
//      시작·완료는 챌린지 타임존 기준 "날짜" 비교.
//  R3. 조기 수동 시작 시 유효 시작일(actualStartAt)이 예정일을 대체하며,
//      Day 계산·완주 판정은 항상 유효 시작일 기준이다.
//  R4. 표시 계층은 resolveEffectiveLifecycle로 "지금 이 순간의 상태"를 계산해
//      워커 주기(10분) 사이의 지연을 사용자에게 보이지 않게 한다.

const LIFECYCLE_ORDER: Record<ChallengeLifecycle, number> = {
  draft: 0,
  recruiting: 1,
  preparing: 2,
  active: 3,
  completed: 4,
  archived: 5,
};

/** 자동 전이 forward-only 보장용 (R1) */
export function isForwardTransition(from: ChallengeLifecycle, to: ChallengeLifecycle): boolean {
  return LIFECYCLE_ORDER[to] > LIFECYCLE_ORDER[from];
}

export interface EffectiveLifecycleInput {
  lifecycle: ChallengeLifecycle;
  /** 모집 자동 오픈 예정 시각 (ISO). 없으면 수동 publish만 가능 */
  recruitOpenAt?: string | null;
  /** 모집 자동 마감 예정 시각 (ISO). 없으면 시작일까지 모집 유지 */
  recruitCloseAt?: string | null;
  /** 유효 시작일 'YYYY-MM-DD' — 조기 수동 시작 시 actualStartAt 기준으로 재산정된 값 (R3) */
  startDate?: string;
  durationDays: number;
  /** 현재 시각 (ISO) — 시각 비교용 (R2) */
  nowIso: string;
  /** 챌린지 타임존 기준 오늘 'YYYY-MM-DD' — 날짜 비교용 (R2) */
  today: string;
  /** 리더/운영자의 시작 확인이 필요한 챌린지는 확인 전 자동 시작 금지 */
  requireStartConfirmation?: boolean;
  startConfirmed?: boolean;
}

/**
 * "지금 이 순간 도달해 있어야 할" 라이프사이클을 계산한다.
 * 워커(실제 전이)와 API 읽기 계층(표시 보정)이 동일하게 사용한다 (R4).
 */
export function resolveEffectiveLifecycle(input: EffectiveLifecycleInput): ChallengeLifecycle {
  const {
    lifecycle, recruitOpenAt, recruitCloseAt, startDate, durationDays,
    nowIso, today, requireStartConfirmation, startConfirmed,
  } = input;

  let state = lifecycle;

  // 예약 모집 오픈: draft + 오픈 시각 경과 → recruiting (증상① 해결)
  if (state === 'draft' && recruitOpenAt && recruitOpenAt <= nowIso) {
    state = 'recruiting';
  }
  // 예약 모집 마감: recruiting + 마감 시각 경과 → preparing
  // (수동으로 이미 preparing 이후라면 조건 불일치로 자동 no-op — R1, 증상② 해결)
  if (state === 'recruiting' && recruitCloseAt && recruitCloseAt <= nowIso) {
    state = 'preparing';
  }

  // 날짜 기준 시작/완료 (기존 resolveDueLifecycle 규칙)
  const due = resolveDueLifecycle({ lifecycle: state, startDate, durationDays, today });

  // 시작 확인 게이트: active 이상 진입을 확인 전까지 보류
  const wouldStart = LIFECYCLE_ORDER[due] >= LIFECYCLE_ORDER.active && LIFECYCLE_ORDER[state] < LIFECYCLE_ORDER.active;
  if (wouldStart && requireStartConfirmation === true && !startConfirmed) {
    return state;
  }

  // forward-only 보장 (R1): 계산 결과가 뒤라면 현재 상태 유지
  return LIFECYCLE_ORDER[due] > LIFECYCLE_ORDER[state] ? due : state;
}

/** from→target까지의 허용 전이 경로를 단계로 분해 (예: draft→[recruiting,preparing]) */
export function transitionSteps(
  from: ChallengeLifecycle,
  target: ChallengeLifecycle,
): ChallengeLifecycle[] {
  if (from === target) return [];
  if (!isForwardTransition(from, target) || target === 'archived') return [];
  const path: ChallengeLifecycle[] = ['draft', 'recruiting', 'preparing', 'active', 'completed'];
  const steps: ChallengeLifecycle[] = [];
  let cursor = from;
  for (const next of path.slice(path.indexOf(from) + 1)) {
    if (LIFECYCLE_ORDER[next] > LIFECYCLE_ORDER[target]) break;
    // recruiting→active처럼 canTransition이 직접 점프를 허용하면 중간 단계 생략
    if (canTransition(cursor, target)) return [...steps, target];
    if (canTransition(cursor, next)) {
      steps.push(next);
      cursor = next;
    }
  }
  return cursor === target ? steps : [];
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
