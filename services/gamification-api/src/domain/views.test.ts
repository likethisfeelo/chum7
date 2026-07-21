import {
  toBadgeListView,
  countCompletedByLine,
  buildMythologyProgress,
  buildCollectionView,
  pickNextCharacterType,
} from './views';
import type { CharacterRecord } from './character-slot';

function char(partial: Partial<CharacterRecord>): CharacterRecord {
  return {
    characterId: 'c1',
    userId: 'u1',
    mythologyLine: 'korean',
    characterType: '웅녀',
    slots: [],
    filledCount: 0,
    status: 'in_progress',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('toBadgeListView', () => {
  it('누락 필드는 null 기본값으로 매핑한다 (레거시 badge/list 계약)', () => {
    const [view] = toBadgeListView([{ badgeId: '3-day-streak', grantedAt: '2026-01-02T00:00:00Z' }]);
    expect(view).toEqual({
      badgeId: '3-day-streak',
      grantedAt: '2026-01-02T00:00:00Z',
      challengeId: null,
      verificationId: null,
      sourceDay: null,
      sourceConsecutiveDays: null,
    });
  });

  it('숫자가 아닌 sourceDay/sourceConsecutiveDays는 null 처리한다', () => {
    const [view] = toBadgeListView([
      { badgeId: 'b', grantedAt: 't', sourceDay: '3' as unknown, sourceConsecutiveDays: 7 },
    ]);
    expect(view!.sourceDay).toBeNull();
    expect(view!.sourceConsecutiveDays).toBe(7);
  });

  it('grantedAt 내림차순(최신순)으로 정렬한다', () => {
    const views = toBadgeListView([
      { badgeId: 'old', grantedAt: '2026-01-01T00:00:00Z' },
      { badgeId: 'new', grantedAt: '2026-03-01T00:00:00Z' },
      { badgeId: 'mid', grantedAt: '2026-02-01T00:00:00Z' },
    ]);
    expect(views.map((v) => v.badgeId)).toEqual(['new', 'mid', 'old']);
  });
});

describe('countCompletedByLine + buildMythologyProgress', () => {
  it('complete 상태만 세계관별로 집계한다', () => {
    const counts = countCompletedByLine([
      char({ status: 'complete', mythologyLine: 'korean' }),
      char({ status: 'complete', mythologyLine: 'korean' }),
      char({ status: 'in_progress', mythologyLine: 'korean' }),
      char({ status: 'complete', mythologyLine: 'greek' }),
    ]);
    expect(counts).toEqual({ korean: 2, greek: 1 });
  });

  it('빈 집계는 레거시 buildEmptyProgress와 동일한 형태를 만든다', () => {
    expect(buildMythologyProgress({})).toEqual({
      korean: { total: 5, completed: 0, isCompleted: false },
      greek: { total: 3, completed: 0, isCompleted: false },
      norse: { total: 3, completed: 0, isCompleted: false },
    });
  });

  it('총 캐릭터 수 이상 완성하면 isCompleted', () => {
    const progress = buildMythologyProgress({ greek: 3, korean: 4 });
    expect(progress.greek).toEqual({ total: 3, completed: 3, isCompleted: true });
    expect(progress.korean).toEqual({ total: 5, completed: 4, isCompleted: false });
  });
});

describe('buildCollectionView', () => {
  it('완성/진행 분리 + 완성 타입별 중복 보유 수를 계산한다', () => {
    const view = buildCollectionView([
      char({ characterId: 'a', status: 'complete', characterType: '웅녀', completedAt: 't1' }),
      char({ characterId: 'b', status: 'complete', characterType: '웅녀', completedAt: 't2' }),
      char({ characterId: 'c', status: 'complete', characterType: '호랑이', completedAt: 't3' }),
      char({ characterId: 'd', status: 'in_progress', characterType: '이무기', filledCount: 4 }),
    ]);
    expect(view.completed).toHaveLength(3);
    expect(view.completed.filter((c) => c.characterType === '웅녀').map((c) => c.count)).toEqual([2, 2]);
    expect(view.completed.find((c) => c.characterType === '호랑이')!.count).toBe(1);
    expect(view.inProgress).toEqual([
      { characterId: 'd', mythologyLine: 'korean', characterType: '이무기', filledCount: 4 },
    ]);
  });

  it('completedAt 누락 시 null (레거시 계약)', () => {
    const view = buildCollectionView([char({ status: 'complete', completedAt: undefined })]);
    expect(view.completed[0]!.completedAt).toBeNull();
  });
});

describe('pickNextCharacterType', () => {
  it('요청 타입이 해당 세계관 소속이면 그대로 사용한다', () => {
    expect(pickNextCharacterType('korean', new Set(), '도깨비')).toBe('도깨비');
  });

  it('요청 타입이 다른 세계관 것이면 무시하고 미완성 첫 캐릭터를 고른다', () => {
    expect(pickNextCharacterType('korean', new Set(['웅녀']), '토르')).toBe('호랑이');
  });

  it('요청이 없으면 아직 완성 안 한 첫 캐릭터', () => {
    expect(pickNextCharacterType('greek', new Set(['아테나']))).toBe('페넬로페');
  });

  it('전부 완성했으면 첫 캐릭터로 되돌아간다 (중복 보유 허용)', () => {
    expect(pickNextCharacterType('norse', new Set(['이그드라실', '발키리', '토르']))).toBe('이그드라실');
  });
});
