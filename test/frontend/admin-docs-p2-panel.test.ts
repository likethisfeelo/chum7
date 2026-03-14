import fs from 'fs';
import path from 'path';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('frontend admin docs p2 panel guards', () => {
  test('admin docs page exposes p2 routing quick actions', () => {
    const src = read('frontend/src/features/admin/pages/AdminDocsPage.tsx');

    expect(src).toContain("/admin/challenges/${challengeId}/toggle");
    expect(src).toContain("/admin/challenges/${challengeId}/confirm-start");
    expect(src).toContain("/admin/challenges/${challengeId}/lifecycle");
    expect(src).toContain("/admin/challenges/${challengeId}/personal-quest-proposals");
    expect(src).toContain("/admin/stats/overview");
    expect(src).toContain('P2 관리자 라우팅 빠른 점검 패널');
  });

  test('admin docs page includes cloudwatch/ops checklist links', () => {
    const src = read('frontend/src/features/admin/pages/AdminDocsPage.tsx');

    expect(src).toContain('운영 체크리스트 & CloudWatch 점검');
    expect(src).toContain('lifecycle transition summary 로그 확인');
    expect(src).toContain('badgesTable 쓰기 실패 알람 확인');
    expect(src).toContain('docs/challenge-app-dev-plan.md §8.5');
  });
});
