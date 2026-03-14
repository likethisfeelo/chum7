import fs from 'fs';
import path from 'path';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('week2 p0 readiness guards', () => {
  test('cheer stack wires targets and use-ticket endpoints', () => {
    const stack = read('infra/stacks/cheer-stack.ts');
    expect(stack).toContain("path: '/cheer/targets'");
    expect(stack).toContain("path: '/cheer/use-ticket'");
    expect(stack).toContain('GetTargetsFn');
    expect(stack).toContain('UseTicketFn');
    expect(stack).toContain('USERS_TABLE');
    expect(stack).toContain('usersTable.grantReadData(getTargetsFn)');
  });

  test('badge stack and core table wiring exist', () => {
    const badgeStack = read('infra/stacks/badge-stack.ts');
    const coreStack = read('infra/stacks/core-stack.ts');
    const app = read('infra/bin/chme.ts');

    expect(badgeStack).toContain("path: '/users/me/badges'");
    expect(badgeStack).toContain("path: '/badges/grant'");
    expect(coreStack).toContain('this.badgesTable = new Table(this, \'BadgesTable\'');
    expect(coreStack).toContain("indexName: 'userId-index'");
    expect(app).toContain('new BadgeStack(app, `chme-${stage}-badge`');
    expect(app).toContain('badgesTable: coreStack.badgesTable');
  });

  test('verification submit delegates badge persistence to shared library', () => {
    const submit = read('backend/services/verification/submit/index.ts');
    expect(submit).toContain('from "../../../shared/lib/badge-grant"');
    expect(submit).toContain('const newBadges = await grantBadges({');
  });
});
