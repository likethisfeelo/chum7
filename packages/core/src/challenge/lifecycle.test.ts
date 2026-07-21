import {
  calendarDay,
  canTransition,
  resolveBucket,
  resolveDueLifecycle,
} from './lifecycle';

describe('challenge lifecycle state machine', () => {
  it('허용된 전이만 통과한다', () => {
    expect(canTransition('draft', 'recruiting')).toBe(true);
    expect(canTransition('recruiting', 'preparing')).toBe(true);
    expect(canTransition('active', 'completed')).toBe(true);
    expect(canTransition('completed', 'archived')).toBe(true);
    expect(canTransition('active', 'recruiting')).toBe(false);
    expect(canTransition('archived', 'active')).toBe(false);
    expect(canTransition('draft', 'active')).toBe(false);
  });

  it('시간 경과에 따른 도달 상태를 계산한다', () => {
    const base = { durationDays: 7, startDate: '2026-08-01' };
    expect(resolveDueLifecycle({ ...base, lifecycle: 'recruiting', today: '2026-07-25' })).toBe('recruiting');
    expect(resolveDueLifecycle({ ...base, lifecycle: 'preparing', today: '2026-07-31' })).toBe('preparing');
    expect(resolveDueLifecycle({ ...base, lifecycle: 'preparing', today: '2026-08-01' })).toBe('active');
    expect(resolveDueLifecycle({ ...base, lifecycle: 'active', today: '2026-08-07' })).toBe('active');
    expect(resolveDueLifecycle({ ...base, lifecycle: 'active', today: '2026-08-08' })).toBe('completed');
    // draft/archived는 시간이 전이시키지 않는다
    expect(resolveDueLifecycle({ ...base, lifecycle: 'draft', today: '2026-08-10' })).toBe('draft');
    expect(resolveDueLifecycle({ ...base, lifecycle: 'archived', today: '2026-08-10' })).toBe('archived');
  });

  it('버킷 분류 — 사용자 화면 4분류', () => {
    expect(resolveBucket('active')).toBe('active');
    expect(resolveBucket('recruiting')).toBe('preparing');
    expect(resolveBucket('preparing')).toBe('preparing');
    expect(resolveBucket('completed')).toBe('completed');
    expect(resolveBucket('archived')).toBe('completed');
    expect(resolveBucket('draft')).toBe('other');
  });

  it('캘린더 Day 계산 — Day X/Y 표시 규칙', () => {
    expect(calendarDay('2026-08-01', '2026-08-01', 7)).toBe(1);
    expect(calendarDay('2026-08-01', '2026-08-03', 7)).toBe(3);
    expect(calendarDay('2026-08-01', '2026-08-20', 7)).toBe(7); // 상한
    expect(calendarDay('2026-08-01', '2026-07-20', 7)).toBe(1); // 하한
  });
});

// ── 스케줄 인지 라이프사이클 (시간 문제 개선판) ──
import { isForwardTransition, resolveEffectiveLifecycle, transitionSteps } from './lifecycle';

describe('resolveEffectiveLifecycle — 예약·수동 상호작용', () => {
  const base = {
    durationDays: 7,
    startDate: '2026-08-10',
    nowIso: '2026-08-01T12:00:00.000Z',
    today: '2026-08-01',
  } as const;

  it('증상①: draft + 모집 오픈 시각 경과 → recruiting 자동 전이', () => {
    expect(resolveEffectiveLifecycle({ ...base, lifecycle: 'draft', recruitOpenAt: '2026-08-01T11:00:00.000Z' })).toBe('recruiting');
    // 오픈 시각 전이면 draft 유지
    expect(resolveEffectiveLifecycle({ ...base, lifecycle: 'draft', recruitOpenAt: '2026-08-01T13:00:00.000Z' })).toBe('draft');
    // 예약 없는 draft는 수동 publish 전까지 draft (자동 전이 없음)
    expect(resolveEffectiveLifecycle({ ...base, lifecycle: 'draft' })).toBe('draft');
  });

  it('예약 모집 마감: recruiting + 마감 시각 경과 → preparing', () => {
    expect(resolveEffectiveLifecycle({ ...base, lifecycle: 'recruiting', recruitCloseAt: '2026-08-01T11:00:00.000Z' })).toBe('preparing');
    expect(resolveEffectiveLifecycle({ ...base, lifecycle: 'recruiting', recruitCloseAt: '2026-08-01T13:00:00.000Z' })).toBe('recruiting');
  });

  it('증상②: 예약 마감보다 먼저 수동 마감한 경우 — 지나간 예약은 no-op (forward-only)', () => {
    // 이미 수동으로 preparing — 마감 예약 시각이 지나도 되돌리거나 중복 전이하지 않음
    expect(resolveEffectiveLifecycle({ ...base, lifecycle: 'preparing', recruitCloseAt: '2026-08-01T11:00:00.000Z' })).toBe('preparing');
  });

  it('증상③: 예정일보다 먼저 수동 시작한 경우 — 유효 시작일 기준으로 완주 판정', () => {
    // 8/10 예정이었으나 8/1에 수동 시작 → startDate(유효)를 8/1로 재산정해 전달
    const manualStarted = { ...base, lifecycle: 'active' as const, startDate: '2026-08-01' };
    expect(resolveEffectiveLifecycle({ ...manualStarted, nowIso: '2026-08-05T00:00:00Z', today: '2026-08-05' })).toBe('active');
    expect(resolveEffectiveLifecycle({ ...manualStarted, nowIso: '2026-08-08T00:00:00Z', today: '2026-08-08' })).toBe('completed');
  });

  it('시작 확인 게이트: 확인 전 자동 시작 보류, 확인 후 진행', () => {
    const gated = { ...base, lifecycle: 'preparing' as const, startDate: '2026-08-01', requireStartConfirmation: true };
    expect(resolveEffectiveLifecycle({ ...gated, startConfirmed: false })).toBe('preparing');
    expect(resolveEffectiveLifecycle({ ...gated, startConfirmed: true })).toBe('active');
  });

  it('draft에서 오픈·마감·시작이 모두 경과한 경우 — 순차 계산으로 completed까지', () => {
    expect(resolveEffectiveLifecycle({
      lifecycle: 'draft',
      recruitOpenAt: '2026-07-01T00:00:00Z',
      recruitCloseAt: '2026-07-05T00:00:00Z',
      startDate: '2026-07-06',
      durationDays: 7,
      nowIso: '2026-08-01T00:00:00Z',
      today: '2026-08-01',
    })).toBe('completed');
  });
});

describe('transitionSteps — 다단계 전이 분해', () => {
  it('허용 경로 분해', () => {
    expect(transitionSteps('draft', 'recruiting')).toEqual(['recruiting']);
    expect(transitionSteps('recruiting', 'preparing')).toEqual(['preparing']);
    expect(transitionSteps('preparing', 'completed')).toEqual(['active', 'completed']);
    expect(transitionSteps('draft', 'preparing')).toEqual(['recruiting', 'preparing']);
  });
  it('동일/역방향/archived는 빈 배열', () => {
    expect(transitionSteps('active', 'active')).toEqual([]);
    expect(transitionSteps('active', 'recruiting')).toEqual([]);
    expect(transitionSteps('draft', 'archived')).toEqual([]);
  });
  it('forward 판정', () => {
    expect(isForwardTransition('draft', 'recruiting')).toBe(true);
    expect(isForwardTransition('active', 'preparing')).toBe(false);
  });
});
