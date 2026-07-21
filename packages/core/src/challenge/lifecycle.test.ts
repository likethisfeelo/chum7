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
