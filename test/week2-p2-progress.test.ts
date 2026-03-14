import fs from 'fs';
import path from 'path';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('week2 p2 progress guards', () => {
  test('admin challenge toggle route is wired', () => {
    const stack = read('infra/stacks/admin-stack.ts');
    expect(stack).toContain('ToggleChallengeFn');
    expect(stack).toContain("../../backend/services/admin/challenge/toggle/index.ts");
    expect(stack).toContain("path: '/admin/challenges/{challengeId}/toggle'");
    expect(stack).toContain('AdminToggleChallengeIntegration');
  });

  test('extra verification visibility endpoint is wired for ux publish control', () => {
    const stack = read('infra/stacks/verification-stack.ts');
    const myRecordsPage = read('frontend/src/features/me/pages/MyRecordsPage.tsx');
    const visibilityHandler = read('backend/services/verification/visibility/index.ts');

    expect(stack).toContain('VisibilityFn');
    expect(stack).toContain('verification-visibility');
    expect(stack).toContain('VerificationVisibilityIntegration');
    expect(stack).toContain("path: \"/verifications/{verificationId}/visibility\"");

    expect(myRecordsPage).toContain('/verifications/${verificationId}/visibility');
    expect(myRecordsPage).toContain('선택 공개');
    expect(myRecordsPage).toContain('전체 공개');

    expect(visibilityHandler).toContain("EXTRA_ONLY_ALLOWED");
    expect(visibilityHandler).toContain('isPersonalOnly = :false, isPublic = :true');
  });
});
