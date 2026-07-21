import {
  decodeFeedCursor,
  encodeFeedCursor,
  parseNextToken,
  toNextToken,
} from './pagination';

describe('nextToken (base64 JSON of LastEvaluatedKey)', () => {
  it('roundtrip', () => {
    const key = { pk: 'POST#p1', sk: 'META', gsi1pk: 'FEED#recruitment', gsi1sk: '2026-07-21T00:00:00.000Z' };
    const token = toNextToken(key);
    expect(token).toEqual(expect.any(String));
    expect(parseNextToken(token)).toEqual(key);
  });

  it('lastKey 없으면 null', () => {
    expect(toNextToken(undefined)).toBeNull();
  });

  it('토큰 없으면 undefined', () => {
    expect(parseNextToken(null)).toBeUndefined();
    expect(parseNextToken(undefined)).toBeUndefined();
  });

  it('손상 토큰은 INVALID_NEXT_TOKEN throw', () => {
    expect(() => parseNextToken('%%%not-base64-json%%%')).toThrow('INVALID_NEXT_TOKEN');
    expect(() => parseNextToken(Buffer.from('"string"').toString('base64'))).toThrow('INVALID_NEXT_TOKEN');
  });
});

describe('마당 피드 perType 커서 (레거시 포맷 승계)', () => {
  it('roundtrip', () => {
    const perType = { recruitment: { gsi1pk: 'FEED#recruitment', gsi1sk: 'x', pk: 'POST#1', sk: 'META' } };
    const encoded = encodeFeedCursor({ perType });
    const decoded = decodeFeedCursor(encoded);
    expect(decoded.perType).toEqual(perType);
  });

  it('빈 perType이면 null 인코딩', () => {
    expect(encodeFeedCursor(null)).toBeNull();
    expect(encodeFeedCursor({ perType: {} })).toBeNull();
  });

  it('구형 lastEvaluatedKey 커서는 legacyCursorDetected 플래그로 재시작', () => {
    const legacy = Buffer.from(JSON.stringify({ lastEvaluatedKey: { plazaPostId: 'p' } })).toString('base64');
    expect(decodeFeedCursor(legacy)).toEqual({ legacyCursorDetected: true });
  });

  it('손상 커서는 빈 커서 (레거시: 조용히 재시작)', () => {
    expect(decodeFeedCursor('garbage!!')).toEqual({});
    expect(decodeFeedCursor(undefined)).toEqual({});
  });
});
