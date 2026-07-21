import {
  calculateChallengeEndAt,
  initialLifecycle,
  resolveDurationDays,
  resolveLayerPolicy,
  resolvePersonalQuestEnabled,
  validateConfirmStart,
  validateRemedyPolicy,
  validateTimeline,
} from './challenge-admin';

describe('domain/challenge-admin', () => {
  const basePolicy = {
    requirePersonalGoalOnJoin: false,
    requirePersonalTargetOnJoin: true,
    allowExtraVisibilityToggle: true,
  };

  describe('resolveLayerPolicy', () => {
    it('개인 레이어 유형은 requirePersonalGoalOnJoin을 강제한다', () => {
      for (const type of ['personal_only', 'leader_personal', 'mixed']) {
        expect(resolveLayerPolicy(type, basePolicy).requirePersonalGoalOnJoin).toBe(true);
      }
    });

    it('leader_only는 입력값을 유지한다', () => {
      expect(resolveLayerPolicy('leader_only', basePolicy).requirePersonalGoalOnJoin).toBe(false);
    });
  });

  describe('resolvePersonalQuestEnabled', () => {
    it('leader_only → false, 나머지 유형 → true', () => {
      expect(resolvePersonalQuestEnabled('leader_only')).toBe(false);
      expect(resolvePersonalQuestEnabled('personal_only')).toBe(true);
      expect(resolvePersonalQuestEnabled('leader_personal')).toBe(true);
      expect(resolvePersonalQuestEnabled('mixed')).toBe(true);
      expect(resolvePersonalQuestEnabled('unknown')).toBe(false);
    });
  });

  describe('validateTimeline', () => {
    it('모집 마감이 시작보다 빠르면 INVALID_TIMELINE', () => {
      const err = validateTimeline({
        recruitingStartAt: '2026-08-01T00:00:00.000Z',
        recruitingEndAt: '2026-07-31T00:00:00.000Z',
        challengeStartAt: '2026-08-10T00:00:00.000Z',
      });
      expect(err?.error).toBe('INVALID_TIMELINE');
    });

    it('챌린지 시작이 모집 마감 + 1분 이내면 INVALID_TIMELINE', () => {
      const err = validateTimeline({
        recruitingStartAt: '2026-08-01T00:00:00.000Z',
        recruitingEndAt: '2026-08-05T00:00:00.000Z',
        challengeStartAt: '2026-08-05T00:00:30.000Z',
      });
      expect(err?.error).toBe('INVALID_TIMELINE');
    });

    it('정상 타임라인 → null', () => {
      const err = validateTimeline({
        recruitingStartAt: '2026-08-01T00:00:00.000Z',
        recruitingEndAt: '2026-08-05T00:00:00.000Z',
        challengeStartAt: '2026-08-05T00:01:00.000Z',
      });
      expect(err).toBeNull();
    });
  });

  describe('validateRemedyPolicy', () => {
    it('last_day에서 maxRemedyDays > durationDays-1 이면 오류', () => {
      const err = validateRemedyPolicy({ type: 'last_day', maxRemedyDays: 7 }, 7);
      expect(err?.error).toBe('INVALID_MAX_REMEDY_DAYS');
    });

    it('anytime은 검증하지 않는다', () => {
      expect(validateRemedyPolicy({ type: 'anytime', maxRemedyDays: null }, 7)).toBeNull();
    });
  });

  it('calculateChallengeEndAt — 시작일 + durationDays', () => {
    expect(calculateChallengeEndAt('2026-08-05T00:00:00.000Z', 7)).toBe('2026-08-12T00:00:00.000Z');
    expect(calculateChallengeEndAt('invalid', 7)).toBe('invalid');
  });

  it('resolveDurationDays — 유효값은 내림, 비정상 값은 fallback 7', () => {
    expect(resolveDurationDays(10.9)).toBe(10);
    expect(resolveDurationDays('x')).toBe(7);
    expect(resolveDurationDays(0)).toBe(7);
  });

  it('initialLifecycle — 모집 시작 시각 경과 여부', () => {
    expect(initialLifecycle('2026-08-02T00:00:00.000Z', '2026-08-01T00:00:00.000Z')).toBe('recruiting');
    expect(initialLifecycle('2026-07-31T00:00:00.000Z', '2026-08-01T00:00:00.000Z')).toBe('draft');
  });

  describe('validateConfirmStart', () => {
    it('preparing이 아니면 INVALID_LIFECYCLE 409', () => {
      const err = validateConfirmStart({ lifecycle: 'active', requireStartConfirmation: true });
      expect(err).toMatchObject({ status: 409, error: 'INVALID_LIFECYCLE' });
    });

    it('requireStartConfirmation=false면 CONFIRMATION_NOT_REQUIRED 409', () => {
      const err = validateConfirmStart({ lifecycle: 'preparing', requireStartConfirmation: false });
      expect(err).toMatchObject({ status: 409, error: 'CONFIRMATION_NOT_REQUIRED' });
    });

    it('정상 → null', () => {
      expect(validateConfirmStart({ lifecycle: 'preparing', requireStartConfirmation: true })).toBeNull();
    });
  });
});
