import { getChallengeStatusLabel, resolveChallengeBucket } from '../../frontend/src/features/challenge/utils/challengeLifecycle';

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
});
