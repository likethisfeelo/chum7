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
    // If challenge is active but user phase is still 'preparing', promote phase to match
    if (lifecycle === 'active' && phase === 'preparing' && status !== 'completed' && status !== 'failed') {
      return { status, phase: 'active' };
    }
    return { status, phase };
  }

  const finalizedStatus = input.completedDays >= input.durationDays ? 'completed' : 'failed';
  return { status: finalizedStatus, phase: finalizedStatus };
}


export function matchesRequestedChallengeStatus(requestedStatus: string, normalizedStatus: string): boolean {
  const requested = String(requestedStatus || 'active').toLowerCase();
  const normalized = String(normalizedStatus || '').toLowerCase();

  if (requested === 'all') return true;
  if (requested === 'active') return normalized === 'active';
  if (requested === 'completed') return normalized === 'completed';
  if (requested === 'failed') return normalized === 'failed';
  return normalized === requested;
}
