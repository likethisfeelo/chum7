import {
  collectMissedChallenges,
  computeTodayChallengeDay,
  missedDaysOf,
  remedyPolicyOf,
} from '../../frontend/src/features/challenge/utils/remedyStatus';

/**
 * 보완 대상 판정 — 회귀 방지.
 * 과거 버그: 서버 저장 currentDay(갱신 지연으로 0/1 고착)에 의존해 미인증 Day가
 * 있어도 보완 대상이 0건이 되어 제출 버튼이 비활성화됐다.
 */

/** KST 기준 오늘로부터 daysAgo 일 전 날짜(YYYY-MM-DD) — 시작일 픽스처 생성용 */
function kstDateStringDaysAgo(daysAgo: number): string {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const base = Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate());
  const target = new Date(base - daysAgo * 24 * 60 * 60 * 1000);
  return target.toISOString().slice(0, 10);
}

interface FixtureOptions {
  durationDays: number;
  /** 오늘이 Day N이 되도록 시작일을 잡는다 */
  todayDay: number;
  successDays: number[];
  remediedDays?: number[];
  storedCurrentDay?: number;
  status?: string;
  remedyPolicy?: { type: string; maxRemedyDays?: number | null };
  /**
   * 실서비스 응답 형태 재현 — join은 참여 레코드에 remedyPolicy를 저장하지 않아
   * 최상위는 null이고 정책은 challenge.remedyPolicy(defaultRemedyPolicy)에만 있다.
   */
  policyOnChallengeOnly?: boolean;
}

function participation(opts: FixtureOptions) {
  const policy = opts.remedyPolicy ?? { type: 'anytime', maxRemedyDays: null };
  const progressLength = policy.type === 'last_day' ? opts.durationDays - 1 : opts.durationDays;
  return {
    userChallengeId: `uc-${opts.todayDay}`,
    challengeId: 'ch-1',
    status: opts.status ?? 'active',
    // 저장 currentDay는 일부러 갱신되지 않은 값으로 둔다 (버그 재현 조건)
    currentDay: opts.storedCurrentDay ?? 1,
    durationDays: opts.durationDays,
    startDate: kstDateStringDaysAgo(opts.todayDay - 1),
    remedyPolicy: opts.policyOnChallengeOnly ? null : policy,
    progress: Array.from({ length: progressLength }, (_, i) => {
      const day = i + 1;
      return {
        day,
        status: opts.successDays.includes(day) ? 'success' : null,
        remedied: opts.remediedDays?.includes(day) ?? false,
      };
    }),
    challenge: {
      title: '테스트 챌린지',
      badgeIcon: '🎯',
      durationDays: opts.durationDays,
      remedyPolicy: opts.policyOnChallengeOnly ? policy : null,
    },
  };
}

describe('computeTodayChallengeDay', () => {
  test('저장 currentDay가 밀려 있어도 시작일 기준 달력으로 오늘 Day를 계산한다', () => {
    const item = participation({ durationDays: 5, todayDay: 5, successDays: [1, 2], storedCurrentDay: 1 });
    expect(computeTodayChallengeDay(item)).toBe(5);
  });

  test('시작 전이면 최소 1을 반환한다', () => {
    const item = participation({ durationDays: 5, todayDay: 1, successDays: [] });
    expect(computeTodayChallengeDay(item)).toBe(1);
  });
});

describe('missedDaysOf', () => {
  test('지나간 미인증 Day를 모두 돌려준다 (저장 currentDay 무관)', () => {
    const item = participation({ durationDays: 5, todayDay: 5, successDays: [1, 2], storedCurrentDay: 1 });
    expect(missedDaysOf(item)).toEqual([3, 4]);
  });

  test('오늘은 제외한다 — 일반 인증으로 채울 수 있는 날이라 보완 대상이 아니다', () => {
    const item = participation({ durationDays: 5, todayDay: 5, successDays: [] });
    expect(missedDaysOf(item)).not.toContain(5);
  });

  test('종료 후에는 대상이 없다 — 기간이 끝나면 점수가 확정된다', () => {
    const item = participation({ durationDays: 5, todayDay: 6, successDays: [1, 2, 3, 4] });
    expect(missedDaysOf(item)).toEqual([]);
  });

  test('이미 보완한 Day는 제외한다', () => {
    const item = participation({ durationDays: 5, todayDay: 5, successDays: [1], remediedDays: [2] });
    expect(missedDaysOf(item)).toEqual([3, 4]);
  });
});

describe('collectMissedChallenges', () => {
  test('마지막 날에는 그 이전 미인증일이 보완 대상 (마지막 날 당일은 일반 인증)', () => {
    const item = participation({ durationDays: 5, todayDay: 5, successDays: [1, 2] });
    const result = collectMissedChallenges([item]);
    expect(result).toHaveLength(1);
    expect(result[0].missedDays).toEqual([3, 4]);
  });

  test('종료 직후부터 목록에서 빠진다 — 유예 없음', () => {
    const item = participation({
      durationDays: 5,
      todayDay: 6,
      successDays: [1, 2, 3, 4],
      status: 'failed',
    });
    expect(collectMissedChallenges([item])).toHaveLength(0);
  });

  test('중도 포기·보완 불가 정책은 제외한다', () => {
    const gaveUp = participation({ durationDays: 5, todayDay: 5, successDays: [], status: 'gave_up' });
    const disabled = participation({
      durationDays: 5,
      todayDay: 5,
      successDays: [],
      remedyPolicy: { type: 'disabled' },
    });
    expect(collectMissedChallenges([gaveUp, disabled])).toHaveLength(0);
  });

  test('last_day 정책은 마지막 날에만 창이 열린다 (서버 판정과 일치)', () => {
    const beforeLastDay = participation({
      durationDays: 5,
      todayDay: 4,
      successDays: [1],
      remedyPolicy: { type: 'last_day', maxRemedyDays: null },
    });
    const onLastDay = participation({
      durationDays: 5,
      todayDay: 5,
      successDays: [1],
      remedyPolicy: { type: 'last_day', maxRemedyDays: null },
    });
    expect(collectMissedChallenges([beforeLastDay])).toHaveLength(0);
    expect(collectMissedChallenges([onLastDay])[0].missedDays).toEqual([2, 3, 4]);
  });

  test('last_day 정책의 잔여 보완 횟수가 소진되면 제외한다', () => {
    const item = participation({
      durationDays: 5,
      todayDay: 5,
      successDays: [1],
      remediedDays: [2],
      remedyPolicy: { type: 'last_day', maxRemedyDays: 1 },
    });
    expect(collectMissedChallenges([item])).toHaveLength(0);
  });

  test('놓친 날이 많은 챌린지가 앞에 온다', () => {
    const few = participation({ durationDays: 5, todayDay: 5, successDays: [1, 2, 3] });
    const many = participation({ durationDays: 5, todayDay: 5, successDays: [] });
    const result = collectMissedChallenges([few, many]);
    expect(result[0].missedDays.length).toBeGreaterThan(result[1].missedDays.length);
  });
});

describe('remedyPolicyOf — 정책 소스 폴백', () => {
  test('참여 레코드에 정책이 없으면 challenge.remedyPolicy로 폴백한다', () => {
    const item = participation({
      durationDays: 7,
      todayDay: 3,
      successDays: [1],
      remedyPolicy: { type: 'disabled' },
      policyOnChallengeOnly: true,
    });
    expect(item.remedyPolicy).toBeNull(); // 실서비스 형태 검증
    expect(remedyPolicyOf(item)).toEqual({ type: 'disabled' });
  });

  test('[회귀] challenge 쪽에만 있는 disabled 정책도 허브에서 제외된다', () => {
    const item = participation({
      durationDays: 5,
      todayDay: 4,
      successDays: [],
      remedyPolicy: { type: 'disabled' },
      policyOnChallengeOnly: true,
    });
    expect(collectMissedChallenges([item])).toHaveLength(0);
  });

  test('[회귀] challenge 쪽에만 있는 last_day 정책도 마지막 날 전에는 제외된다', () => {
    const item = participation({
      durationDays: 7,
      todayDay: 4,
      successDays: [1],
      remedyPolicy: { type: 'last_day', maxRemedyDays: 2 },
      policyOnChallengeOnly: true,
    });
    expect(collectMissedChallenges([item])).toHaveLength(0);
  });
});

describe('기간별 매트릭스 (3·5·7일)', () => {
  test.each([
    [3, 2, [1]], // 3일: Day 2에 Day 1 보완 가능
    [5, 3, [1, 2]], // 5일: Day 3에 Day 1~2
    [7, 6, [1, 2, 3, 4, 5]], // 7일: Day 6에 Day 1~5
  ])('anytime %i일 챌린지 — Day %i에 놓친 %p 보완 대상', (duration, today, expected) => {
    const item = participation({ durationDays: duration, todayDay: today, successDays: [] });
    expect(missedDaysOf(item)).toEqual(expected);
  });

  test.each([
    [3, 4],
    [5, 6],
    [7, 8],
  ])('%i일 챌린지는 Day %i(종료 후)부터 보완 창이 닫힌다', (duration, dayAfterEnd) => {
    const item = participation({ durationDays: duration, todayDay: dayAfterEnd, successDays: [] });
    expect(missedDaysOf(item)).toEqual([]);
    expect(collectMissedChallenges([item])).toHaveLength(0);
  });

  test.each([
    [3, [1, 2]],
    [5, [1, 2, 3, 4]],
    [7, [1, 2, 3, 4, 5, 6]],
  ])('last_day %i일 챌린지 — 마지막 날에 정규일 %p 전체가 대상', (duration, expected) => {
    const item = participation({
      durationDays: duration,
      todayDay: duration,
      successDays: [],
      remedyPolicy: { type: 'last_day', maxRemedyDays: null },
      policyOnChallengeOnly: true,
    });
    const result = collectMissedChallenges([item]);
    expect(result).toHaveLength(1);
    expect(result[0].missedDays).toEqual(expected);
  });

  test('anytime Day 1에는 대상이 없다 (서버 Day 2 개방과 일치)', () => {
    const item = participation({ durationDays: 3, todayDay: 1, successDays: [] });
    expect(missedDaysOf(item)).toEqual([]);
  });
});

describe('anytime 횟수 제한 (기간 중 1회만 = anytime + maxRemedyDays:1)', () => {
  test('아직 보완하지 않았으면 허브에 노출된다', () => {
    const item = participation({
      durationDays: 5,
      todayDay: 4,
      successDays: [1],
      remedyPolicy: { type: 'anytime', maxRemedyDays: 1 },
      policyOnChallengeOnly: true,
    });
    expect(collectMissedChallenges([item])).toHaveLength(1);
  });

  test('1회 소진하면 허브에서 빠진다', () => {
    const item = participation({
      durationDays: 5,
      todayDay: 4,
      successDays: [1],
      remediedDays: [2],
      remedyPolicy: { type: 'anytime', maxRemedyDays: 1 },
      policyOnChallengeOnly: true,
    });
    expect(collectMissedChallenges([item])).toHaveLength(0);
  });
});
