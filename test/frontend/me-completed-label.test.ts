import fs from 'fs';
import path from 'path';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('ME completed tab failed label', () => {
  test('shows 종료(미달성) label and gray border for failed challenge', () => {
    const src = read('frontend/src/features/me/pages/MEPage.tsx');
    expect(src).toContain('종료(미달성)');
    expect(src).toContain('border-gray-300');
    expect(src).toContain('isFailedChallengeState(challenge)');
  });
});
