import { inferVerificationType } from '../../backend/shared/lib/verification-type';

describe('verification submit inferVerificationType', () => {
  test('prefers explicit verificationType', () => {
    const inferred = inferVerificationType({
      userChallengeId: '550e8400-e29b-41d4-a716-446655440000',
      day: 1,
      verificationType: 'link',
      imageUrl: 'https://example.com/image.jpg',
    } as any);

    expect(inferred).toBe('link');
  });

  test('falls back in priority order link > video > image > text', () => {
    expect(inferVerificationType({ userChallengeId: '550e8400-e29b-41d4-a716-446655440000', day: 1, linkUrl: 'https://a.com' } as any)).toBe('link');
    expect(inferVerificationType({ userChallengeId: '550e8400-e29b-41d4-a716-446655440000', day: 1, videoUrl: 'https://a.com/v.mp4' } as any)).toBe('video');
    expect(inferVerificationType({ userChallengeId: '550e8400-e29b-41d4-a716-446655440000', day: 1, imageUrl: 'https://a.com/i.jpg' } as any)).toBe('image');
    expect(inferVerificationType({ userChallengeId: '550e8400-e29b-41d4-a716-446655440000', day: 1 } as any)).toBe('text');
  });

  test('ignores blank string media fields when inferring', () => {
    expect(inferVerificationType({ linkUrl: '   ' } as any)).toBe('text');
    expect(inferVerificationType({ videoUrl: '   ', imageUrl: ' https://a.com/i.jpg ' } as any)).toBe('image');
  });
});
