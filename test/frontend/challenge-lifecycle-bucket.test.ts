import {
  countParticipatedDays,
  getChallengeStatusLabel,
  isVerificationDayCompleted,
  resolveChallengeBucket,
  resolveChallengeDay,
} from '../../frontend/src/features/challenge/utils/challengeLifecycle';

describe('challengeLifecycle resolveChallengeBucket', () => {
  test('maps failed/archived to completed bucket', () => {
    expect(resolveChallengeBucket({ status: 'failed' })).toBe('completed');
    expect(resolveChallengeBucket({ phase: 'failed' })).toBe('completed');
    expect(resolveChallengeBucket({ challenge: { lifecycle: 'archived' } })).toBe('completed');
  });

  test('maps preparing states correctly', () => {
    expect(resolveChallengeBucket({ status: 'active', phase: 'preparing' })).toBe('preparing');
    expect(resolveChallengeBucket({ status: 'active', challenge: { lifecycle: 'recruiting' } })).toBe('preparing');
  });

  test('status label reflects bucket', () => {
    expect(getChallengeStatusLabel({ status: 'active' })).toBe('진행중');
    expect(getChallengeStatusLabel({ status: 'active', phase: 'preparing' })).toBe('준비중');
    expect(getChallengeStatusLabel({ status: 'completed' })).toBe('완주');
  });

  test('resolveChallengeDay clamps by duration', () => {
    expect(resolveChallengeDay({ currentDay: 3, durationDays: 7 })).toBe(3);
    expect(resolveChallengeDay({ currentDay: 99, durationDays: 7 })).toBe(8);
    expect(resolveChallengeDay({ currentDay: 'bad', durationDays: 7 })).toBe(1);
  });

  test('verification completion helper checks day status', () => {
    const progress = [{ day: 1, status: 'success' }, { day: 2, status: 'pending' }];
    expect(isVerificationDayCompleted(progress, 1)).toBe(true);
    expect(isVerificationDayCompleted(progress, 2)).toBe(false);
  });

  test('countParticipatedDays counts deduped completed-like statuses', () => {
    const progress = [
      { day: 1, status: 'success' },
      { day: 1, status: 'success' },
      { day: 2, status: 'failed' },
      { day: 3, status: 'pending' },
      { day: 4, status: 'remedy' },
    ];
    expect(countParticipatedDays(progress)).toBe(3);
  });
});
