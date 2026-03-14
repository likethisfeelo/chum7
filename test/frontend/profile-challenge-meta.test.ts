import fs from 'fs';
import path from 'path';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Profile challenge card metadata', () => {
  test('renders normalized day/progress meta with shared lifecycle helpers', () => {
    const src = read('frontend/src/features/profile/pages/ProfilePage.tsx');
    expect(src).toContain('resolveChallengeDurationDays');
    expect(src).toContain('resolveChallengeDay');
    expect(src).toContain('getChallengeProgressSummary');
    expect(src).toContain('진행률 {completionRate}%');
  });
});
