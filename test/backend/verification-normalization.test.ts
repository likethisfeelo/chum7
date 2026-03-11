import { resolveVerificationType } from '../../backend/shared/lib/verification-normalization';

describe('verification normalization resolveVerificationType', () => {
  test('uses valid explicit type first', () => {
    expect(resolveVerificationType({ verificationType: 'video', imageUrl: 'https://a.com/i.jpg' })).toBe('video');
  });

  test('falls back when explicit type is invalid/blank', () => {
    expect(resolveVerificationType({ verificationType: 'unknown', linkUrl: 'https://a.com' })).toBe('link');
    expect(resolveVerificationType({ verificationType: '   ', videoUrl: 'https://a.com/v.mp4' })).toBe('video');
  });

  test('detects legacy video when imageUrl is actually video extension', () => {
    expect(resolveVerificationType({ imageUrl: 'https://a.com/upload/abc.mp4' })).toBe('video');
  });

  test('defaults to text when no usable media fields', () => {
    expect(resolveVerificationType({ imageUrl: '   ', videoUrl: '', linkUrl: null })).toBe('text');
  });
});
