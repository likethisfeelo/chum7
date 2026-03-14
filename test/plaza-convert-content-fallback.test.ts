import { buildPlazaFallbackContent } from '../backend/shared/lib/plaza-convert-content';

describe('buildPlazaFallbackContent', () => {
  test('uses trimmed todayNote first', () => {
    const content = buildPlazaFallbackContent({
      todayNote: '  오늘 인증 완료!  ',
      tomorrowPromise: '내일도 화이팅',
      day: 3,
    });

    expect(content).toBe('오늘 인증 완료!');
  });

  test('falls back to trimmed tomorrowPromise when todayNote is empty', () => {
    const content = buildPlazaFallbackContent({
      todayNote: '   ',
      tomorrowPromise: '  내일도 해볼게요  ',
      day: 2,
    });

    expect(content).toBe('내일도 해볼게요');
  });

  test('falls back to day-based message when notes are missing', () => {
    const content = buildPlazaFallbackContent({
      todayNote: null,
      tomorrowPromise: undefined,
      day: '5',
    });

    expect(content).toBe('Day 5 인증을 완료했어요.');
  });

  test('uses generic message when day is invalid', () => {
    const content = buildPlazaFallbackContent({
      todayNote: null,
      tomorrowPromise: '',
      day: 'not-a-number',
    });

    expect(content).toBe('인증을 완료했어요.');
  });
});
