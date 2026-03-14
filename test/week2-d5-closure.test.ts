import fs from 'fs';
import path from 'path';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('week2 d5 closure guards', () => {
  test('cheer p0 endpoints remain wired in cheer stack', () => {
    const stack = read('infra/stacks/cheer-stack.ts');
    expect(stack).toContain("path: '/cheer/targets'");
    expect(stack).toContain("path: '/cheer/use-ticket'");
    expect(stack).toContain('GetTargetsFn');
    expect(stack).toContain('UseTicketFn');
  });

  test('badge persistence flow remains wired end-to-end', () => {
    const submit = read('backend/services/verification/submit/index.ts');
    const grant = read('backend/shared/lib/badge-grant.ts');
    const list = read('backend/services/badge/list/index.ts');
    const grantHandler = read('backend/services/badge/grant/index.ts');

    expect(submit).toContain('const newBadges = await grantBadges({');
    expect(submit).toContain('newBadges,');

    expect(grant).toContain('ConditionExpression: \'attribute_not_exists(badgeId) AND attribute_not_exists(userId)\'');
    expect(grant).toContain('evaluateBadgeIds(input)');

    expect(list).toContain("IndexName: 'userId-index'");
    expect(list).toContain('badges,');

    expect(grantHandler).toContain("error: 'UNAUTHORIZED'");
    expect(grantHandler).toContain("error: 'FORBIDDEN'");
    expect(grantHandler).toContain('input.userId !== authUserId');
  });

  test('badge API and profile badge UI route remain connected', () => {
    const badgeStack = read('infra/stacks/badge-stack.ts');
    const profileBadgePage = read('frontend/src/features/profile/pages/BadgeCollectionPage.tsx');

    expect(badgeStack).toContain("path: '/users/me/badges'");
    expect(badgeStack).not.toContain("path: '/badges/grant'");
    expect(profileBadgePage).toContain("apiClient.get('/users/me/badges')");
  });

  test('cheer targets guards against batch-get 100 key limit', () => {
    const getTargets = read('backend/services/cheer/get-targets/index.ts');
    expect(getTargets).toContain('function chunkArray<T>(items: T[], size: number): T[][]');
    expect(getTargets).toContain('const userIdChunks = chunkArray(uncachedUserIds, 100);');
  });
});
