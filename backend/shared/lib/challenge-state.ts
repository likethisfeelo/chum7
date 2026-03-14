import { isChallengePeriodEnded } from './challenge-day-sync';

export function resolveNormalizedChallengeState(input: {
  status: unknown;
  phase: unknown;
  challengeLifecycle: unknown;
  effectiveCurrentDay: number;
  durationDays: number;
  completedDays: number;
}): { status: string; phase: string } {
  const status = typeof input.status === 'string' ? input.status : 'active';
  const phase = typeof input.phase === 'string' ? input.phase : status;
  const lifecycle = typeof input.challengeLifecycle === 'string' ? input.challengeLifecycle : undefined;

  const shouldAutoFinalize =
    status !== 'completed' &&
    status !== 'failed' &&
    (lifecycle === 'completed' ||
      lifecycle === 'archived' ||
      isChallengePeriodEnded(input.effectiveCurrentDay, input.durationDays, status));

  if (!shouldAutoFinalize) {
    return { status, phase };
  }

  const finalizedStatus = input.completedDays >= input.durationDays ? 'completed' : 'failed';
  return { status: finalizedStatus, phase: finalizedStatus };
}
