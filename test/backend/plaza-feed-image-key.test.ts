import { extractImageS3Key, isLikelySignedAssetUrl } from '../../backend/shared/lib/media-key';

describe('extractImageS3Key', () => {
  test('extracts key from absolute uploads URL', () => {
    expect(extractImageS3Key('https://cdn.chum7.com/uploads/a/b.png')).toBe('a/b.png');
  });

  test('strips query/hash and decodes encoded key in absolute URLs', () => {
    expect(extractImageS3Key('https://cdn.chum7.com/uploads/a%20b.png?X-Amz=1#top')).toBe('a b.png');
  });


  test('supports protocol-relative uploads URLs', () => {
    expect(extractImageS3Key('//cdn.chum7.com/uploads/a/b.png')).toBe('a/b.png');
  });

  test('returns null for non-storage external absolute URLs', () => {
    expect(extractImageS3Key('https://example.com/assets/a.png')).toBeNull();
  });

  test('extracts key from relative uploads path', () => {
    expect(extractImageS3Key('/uploads/a/b.png')).toBe('a/b.png');
    expect(extractImageS3Key('uploads/a/b.png')).toBe('a/b.png');
  });

  test('accepts legacy bare key values', () => {
    expect(extractImageS3Key('a/b.png')).toBe('a/b.png');
    expect(extractImageS3Key('uploads/a/b.png?cache=1')).toBe('a/b.png');
  });

  test('returns null for empty values', () => {
    expect(extractImageS3Key(undefined)).toBeNull();
    expect(extractImageS3Key('   ')).toBeNull();
  });
});

describe('isLikelySignedAssetUrl', () => {
  test('detects aws signed url params', () => {
    expect(isLikelySignedAssetUrl('https://cdn.chum7.com/uploads/a.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc')).toBe(true);
  });

  test('detects legacy signature+expires pair', () => {
    expect(isLikelySignedAssetUrl('https://cdn.chum7.com/uploads/a.png?Signature=abc&Expires=123')).toBe(true);
  });

  test('does not treat plain signature param as signed url', () => {
    expect(isLikelySignedAssetUrl('https://cdn.chum7.com/uploads/a.png?signature=campaign')).toBe(false);
  });
});
