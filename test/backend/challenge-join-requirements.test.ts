import { resolveJoinRequirements as resolveBackendJoinRequirements } from '../../backend/shared/lib/join-requirements';
import { resolveJoinRequirements as resolveFrontendJoinRequirements } from '../../frontend/src/features/challenge/components/join-wizard/requirements';
import { resolveWizardSteps } from '../../frontend/src/features/challenge/components/join-wizard/resolveWizardSteps';

describe('challenge join requirement matrix', () => {
  const matrix = [
    { challengeType: 'leader_only', expected: { requirePersonalGoalOnJoin: false, requirePersonalTargetOnJoin: false } },
    { challengeType: 'personal_only', expected: { requirePersonalGoalOnJoin: true, requirePersonalTargetOnJoin: true } },
    { challengeType: 'leader_personal', expected: { requirePersonalGoalOnJoin: true, requirePersonalTargetOnJoin: true } },
    { challengeType: 'mixed', expected: { requirePersonalGoalOnJoin: true, requirePersonalTargetOnJoin: true } },
  ] as const;

  test.each(matrix)('backend defaults for %s', ({ challengeType, expected }) => {
    expect(resolveBackendJoinRequirements(challengeType, null)).toEqual(expected);
  });

  test.each(matrix)('frontend defaults for %s', ({ challengeType, expected }) => {
    expect(resolveFrontendJoinRequirements({ challengeType, layerPolicy: null })).toEqual(expected);
  });

  test.each(matrix)('backend/frontend consistency for %s', ({ challengeType }) => {
    const backend = resolveBackendJoinRequirements(challengeType, null);
    const frontend = resolveFrontendJoinRequirements({ challengeType, layerPolicy: null });
    expect(frontend).toEqual(backend);
  });
});

describe('layerPolicy partial override handling', () => {
  test('uses explicit requirePersonalGoalOnJoin=false when provided', () => {
    const layerPolicy = { requirePersonalGoalOnJoin: false };
    expect(resolveBackendJoinRequirements('leader_personal', layerPolicy)).toEqual({
      requirePersonalGoalOnJoin: false,
      requirePersonalTargetOnJoin: true,
    });
    expect(resolveFrontendJoinRequirements({ challengeType: 'leader_personal', layerPolicy })).toEqual({
      requirePersonalGoalOnJoin: false,
      requirePersonalTargetOnJoin: true,
    });
  });

  test('uses explicit requirePersonalTargetOnJoin=false when provided', () => {
    const layerPolicy = { requirePersonalTargetOnJoin: false };
    expect(resolveBackendJoinRequirements('mixed', layerPolicy)).toEqual({
      requirePersonalGoalOnJoin: true,
      requirePersonalTargetOnJoin: false,
    });
    expect(resolveFrontendJoinRequirements({ challengeType: 'mixed', layerPolicy })).toEqual({
      requirePersonalGoalOnJoin: true,
      requirePersonalTargetOnJoin: false,
    });
  });
});

describe('wizard step regression', () => {
  test('leader_personal without personalQuestEnabled still requires goal step', () => {
    const steps = resolveWizardSteps({ challengeType: 'leader_personal', personalQuestEnabled: false, layerPolicy: null });
    expect(steps.map((s) => s.id)).toEqual(['time', 'quest', 'confirm']);
    expect(steps[1].required).toBe(true);
    expect(steps[1].validate({
      hour12: 7,
      minute: 0,
      meridiem: 'AM',
      questTitle: '',
      questDescription: '',
      questVerificationType: 'image',
    })).toBe('개인 목표를 입력해주세요');
  });

  test('leader_only without personal quest has only time/confirm steps', () => {
    const steps = resolveWizardSteps({ challengeType: 'leader_only', personalQuestEnabled: false, layerPolicy: null });
    expect(steps.map((s) => s.id)).toEqual(['time', 'confirm']);
  });
});
