import {
  resolveJoinRequirements,
  resolveLayerPolicy,
  resolvePersonalQuestEnabled,
  toTime24,
} from './join-requirements';

// ── test/backend/challenge-join-requirements.test.ts 백엔드 파트 이식 ────────
// (frontend 위자드 스텝 회귀 테스트는 frontend/ 소유 — 이 서비스 범위 밖)

describe('challenge join requirement matrix', () => {
  const matrix = [
    { challengeType: 'leader_only', expected: { requirePersonalGoalOnJoin: false, requirePersonalTargetOnJoin: false } },
    { challengeType: 'personal_only', expected: { requirePersonalGoalOnJoin: true, requirePersonalTargetOnJoin: true } },
    { challengeType: 'leader_personal', expected: { requirePersonalGoalOnJoin: true, requirePersonalTargetOnJoin: true } },
    { challengeType: 'mixed', expected: { requirePersonalGoalOnJoin: true, requirePersonalTargetOnJoin: true } },
  ] as const;

  test.each(matrix)('backend defaults for $challengeType', ({ challengeType, expected }) => {
    expect(resolveJoinRequirements(challengeType, null)).toEqual(expected);
  });
});

describe('layerPolicy partial override handling', () => {
  test('uses explicit requirePersonalGoalOnJoin=false when provided', () => {
    const layerPolicy = { requirePersonalGoalOnJoin: false };
    expect(resolveJoinRequirements('leader_personal', layerPolicy)).toEqual({
      requirePersonalGoalOnJoin: false,
      requirePersonalTargetOnJoin: true,
    });
  });

  test('uses explicit requirePersonalTargetOnJoin=false when provided', () => {
    const layerPolicy = { requirePersonalTargetOnJoin: false };
    expect(resolveJoinRequirements('mixed', layerPolicy)).toEqual({
      requirePersonalGoalOnJoin: true,
      requirePersonalTargetOnJoin: false,
    });
  });
});

// ── 생성 시 layerPolicy 정규화 + personalQuestEnabled 강제 (docs/core-specs/01) ──

describe('resolveLayerPolicy on create', () => {
  const base = { requirePersonalGoalOnJoin: false, requirePersonalTargetOnJoin: true, allowExtraVisibilityToggle: true };

  test('forces personal goal requirement for personal-quest challenge types', () => {
    for (const t of ['personal_only', 'leader_personal', 'mixed']) {
      expect(resolveLayerPolicy(t, base).requirePersonalGoalOnJoin).toBe(true);
    }
  });

  test('keeps explicit setting for leader_only', () => {
    expect(resolveLayerPolicy('leader_only', base).requirePersonalGoalOnJoin).toBe(false);
  });
});

describe('resolvePersonalQuestEnabled', () => {
  test('leader_only → false, everything else → true', () => {
    expect(resolvePersonalQuestEnabled('leader_only')).toBe(false);
    expect(resolvePersonalQuestEnabled('personal_only')).toBe(true);
    expect(resolvePersonalQuestEnabled('leader_personal')).toBe(true);
    expect(resolvePersonalQuestEnabled('mixed')).toBe(true);
  });
});

describe('toTime24', () => {
  test('converts 12h to 24h correctly', () => {
    expect(toTime24(12, 0, 'AM')).toBe('00:00');
    expect(toTime24(7, 5, 'AM')).toBe('07:05');
    expect(toTime24(12, 30, 'PM')).toBe('12:30');
    expect(toTime24(11, 59, 'PM')).toBe('23:59');
  });
});
