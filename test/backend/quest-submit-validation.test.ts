import { normalizeQuestSubmissionContent, validateQuestSubmissionContent } from '../../backend/shared/lib/quest-submit-validation';

describe('quest submit validateQuestSubmissionContent', () => {
  test('video quest requires videoDurationSec', () => {
    const quest = { verificationType: 'video', verificationConfig: { maxDurationSeconds: 60 } };
    const message = validateQuestSubmissionContent(quest, { videoUrl: 'https://example.com/video.mp4' });
    expect(message).toBe('영상 길이 정보가 필요합니다');
  });

  test('video quest rejects invalid duration metadata', () => {
    const quest = { verificationType: 'video', verificationConfig: { maxDurationSeconds: 60 } };
    const message = validateQuestSubmissionContent(quest, {
      videoUrl: 'https://example.com/video.mp4',
      videoDurationSec: Number.NaN,
    });
    expect(message).toBe('영상 길이 정보가 올바르지 않습니다');
  });

  test('video quest rejects over max duration', () => {
    const quest = { verificationType: 'video', verificationConfig: { maxDurationSeconds: 45 } };
    const message = validateQuestSubmissionContent(quest, {
      videoUrl: 'https://example.com/video.mp4',
      videoDurationSec: 46,
    });
    expect(message).toBe('영상은 45초 이내로 제출해 주세요');
  });

  test('video quest accepts valid duration', () => {
    const quest = { verificationType: 'video', verificationConfig: { maxDurationSeconds: 45 } };
    const message = validateQuestSubmissionContent(quest, {
      videoUrl: 'https://example.com/video.mp4',
      videoDurationSec: 30,
    });
    expect(message).toBeNull();
  });

  test('text quest rejects blank text content', () => {
    const quest = { verificationType: 'text', verificationConfig: { maxChars: 100 } };
    const message = validateQuestSubmissionContent(quest, { textContent: '   ' });
    expect(message).toBe('내용을 입력해 주세요');
  });

  test('link quest rejects blank link url', () => {
    const quest = { verificationType: 'link', verificationConfig: {} };
    const message = validateQuestSubmissionContent(quest, { linkUrl: '   ' });
    expect(message).toBe('URL이 필요합니다');
  });

  test('image quest rejects blank image url', () => {
    const quest = { verificationType: 'image', verificationConfig: {} };
    const message = validateQuestSubmissionContent(quest, { imageUrl: '   ' });
    expect(message).toBe('이미지 URL이 필요합니다');
  });
});

describe('quest submit normalizeQuestSubmissionContent', () => {
  test('normalize trims url and text fields', () => {
    const normalized = normalizeQuestSubmissionContent({
      imageUrl: '  https://a.com/i.jpg  ',
      videoUrl: '  https://a.com/v.mp4  ',
      linkUrl: '  https://a.com  ',
      textContent: '  hello  ',
      note: '  note  ',
      videoDurationSec: 12.3,
    });

    expect(normalized).toEqual({
      imageUrl: 'https://a.com/i.jpg',
      videoUrl: 'https://a.com/v.mp4',
      linkUrl: 'https://a.com',
      textContent: 'hello',
      note: 'note',
      videoDurationSec: 12.3,
    });
  });
});
