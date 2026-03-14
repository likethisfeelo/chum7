import {
  countParticipatedDays,
  getChallengeStatusLabel,
  getLatestCompletedProgressEntry,
  getProgressEntryByDay,
  isCompletedVerificationStatus,
  isVerificationDayCompleted,
  resolveChallengeBucket,
  resolveChallengeDay,
  resolveProgressDay,
  resolveVerificationStatusForDay,
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

  test('helpers fallback to index when progress.day is missing', () => {
    const progress = [{ status: 'success' }, { status: 'pending' }, { status: 'failed' }];
    expect(isVerificationDayCompleted(progress, 1)).toBe(true);
    expect(isVerificationDayCompleted(progress, 2)).toBe(false);
    expect(countParticipatedDays(progress)).toBe(2);
  });

  test('progress day helpers resolve day and status safely', () => {
    expect(resolveProgressDay({ day: 3 })).toBe(3);
    expect(resolveProgressDay({}, 1)).toBe(2);
    expect(resolveProgressDay({})).toBeNull();

    const progress = [{ status: 'success' }, { day: 3, status: 'pending' }];
    expect(getProgressEntryByDay(progress, 1)?.status).toBe('success');
    expect(resolveVerificationStatusForDay(progress, 2, 3)).toBe('skipped');
    expect(resolveVerificationStatusForDay(progress, 3, 3)).toBe('pending');
  });

  test('latest completed progress entry prefers highest resolved day', () => {
    const progress = [
      { status: 'success' },
      { day: 5, status: 'pending' },
      { status: 'failed' },
      { day: 4, status: 'success' },
    ];

    const latest = getLatestCompletedProgressEntry(progress);
    expect(latest?.day).toBe(4);
    expect(latest?.entry?.status).toBe('success');
  });

  test('completed status helper is case-insensitive and strict', () => {
    expect(isCompletedVerificationStatus('SUCCESS')).toBe(true);
    expect(isCompletedVerificationStatus('remedy')).toBe(true);
    expect(isCompletedVerificationStatus('failed')).toBe(true);
    expect(isCompletedVerificationStatus('pending')).toBe(false);
    expect(isCompletedVerificationStatus(undefined)).toBe(false);
  });

});
