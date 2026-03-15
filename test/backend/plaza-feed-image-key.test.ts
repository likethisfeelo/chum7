import { extractImageS3Key } from '../../backend/shared/lib/media-key';

describe('extractImageS3Key', () => {
  test('extracts key from absolute uploads URL', () => {
    expect(extractImageS3Key('https://cdn.chum7.com/uploads/a/b.png')).toBe('a/b.png');
  });

  test('strips query/hash and decodes encoded key in absolute URLs', () => {
    expect(extractImageS3Key('https://cdn.chum7.com/uploads/a%20b.png?X-Amz=1#top')).toBe('a b.png');
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
