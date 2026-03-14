import fs from 'fs';
import path from 'path';

describe('plaza convert content fallback (static guard)', () => {
  test('convert-verifications uses fallback content when todayNote is empty', () => {
    const filePath = path.join(__dirname, '../backend/services/plaza/convert-verifications/index.ts');
    const source = fs.readFileSync(filePath, 'utf8');

    expect(source).toContain('normalizedTodayNote');
    expect(source).toContain('normalizedTomorrowPromise');
    expect(source).toContain('fallbackContent');
    expect(source).toContain("content: fallbackContent");
    expect(source).toContain('Day ${item.day} 인증을 완료했어요.');
  });
});
