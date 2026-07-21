import { validateBlocks } from './blocks';

describe('validateBlocks (레거시 동작 승계)', () => {
  it('정상 블록 배열 통과', () => {
    const blocks = [
      { id: 'b1', type: 'text', content: '안내' },
      { id: 'b2', type: 'image', url: 'https://example.com/a.png' },
      { id: 'b3', type: 'link', url: 'https://example.com', label: '링크' },
      { id: 'b4', type: 'video', url: 'https://example.com/v.mp4' },
      { id: 'b5', type: 'rich-text', content: { type: 'doc' } },
    ];
    expect(validateBlocks(blocks, true)).toEqual({ valid: true });
  });

  it('배열이 아니면 실패', () => {
    expect(validateBlocks({} as any, true).valid).toBe(false);
  });

  it('id 누락·잘못된 타입 실패', () => {
    expect(validateBlocks([{ type: 'text', content: 'x' }], true).valid).toBe(false);
    expect(validateBlocks([{ id: 'b', type: 'nope' }], true).valid).toBe(false);
  });

  it('quote 블록은 allowQuote=false 문서(프리뷰)에서 거부', () => {
    const quote = [{ id: 'q1', type: 'quote', content: '인용' }];
    expect(validateBlocks(quote, true).valid).toBe(true);
    expect(validateBlocks(quote, false).valid).toBe(false);
  });

  it('text/quote content 필수, image/link/video url 필수', () => {
    expect(validateBlocks([{ id: 'b', type: 'text', content: ' ' }], true).valid).toBe(false);
    expect(validateBlocks([{ id: 'b', type: 'image', url: 'not-url' }], true).valid).toBe(false);
    expect(validateBlocks([{ id: 'b', type: 'video', url: 'ftp://x' }], true).valid).toBe(false);
  });

  it('동영상 10개 초과 거부 (한국어 메시지)', () => {
    const blocks = Array.from({ length: 11 }, (_, i) => ({
      id: `v${i}`, type: 'video', url: 'https://example.com/v.mp4',
    }));
    const result = validateBlocks(blocks, true);
    expect(result.valid).toBe(false);
    expect(result.message).toBe('동영상은 최대 10개까지 추가할 수 있습니다');
  });
});
