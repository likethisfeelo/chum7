/**
 * 챌린지보드 블록 검증 — 레거시 backend/services/challenge-board/_shared/common.ts
 * validateBlocks 이식 (동작 변경 금지).
 */

export type BlockType = 'text' | 'image' | 'link' | 'quote' | 'rich-text' | 'video';

export function validateBlocks(blocks: any[], allowQuote: boolean): { valid: boolean; message?: string } {
  if (!Array.isArray(blocks)) return { valid: false, message: 'blocks must be an array' };

  for (const block of blocks) {
    if (!block || typeof block !== 'object') return { valid: false, message: 'each block must be an object' };
    if (typeof block.id !== 'string' || !block.id.trim()) return { valid: false, message: 'block.id is required' };
    if (!['text', 'image', 'link', 'quote', 'rich-text', 'video'].includes(block.type)) {
      return { valid: false, message: 'invalid block type' };
    }
    if (!allowQuote && block.type === 'quote') {
      return { valid: false, message: 'quote block is not supported in this document' };
    }

    if (block.type === 'rich-text') {
      if (!block.content || typeof block.content !== 'object') {
        return { valid: false, message: 'rich-text.content must be a TipTap JSON object' };
      }
    }

    if (block.type === 'video') {
      if (typeof block.url !== 'string' || !/^https?:\/\//.test(block.url)) {
        return { valid: false, message: 'video.url must be a valid URL' };
      }
    }

    if (block.type === 'text' || block.type === 'quote') {
      if (typeof block.content !== 'string' || !block.content.trim()) {
        return { valid: false, message: `${block.type}.content is required` };
      }
    }

    if (block.type === 'image') {
      if (typeof block.url !== 'string' || !/^https?:\/\//.test(block.url)) {
        return { valid: false, message: 'image.url must be a valid URL' };
      }
    }

    if (block.type === 'link') {
      if (typeof block.url !== 'string' || !/^https?:\/\//.test(block.url)) {
        return { valid: false, message: 'link.url must be a valid URL' };
      }
      if (block.label && typeof block.label !== 'string') {
        return { valid: false, message: 'link.label must be a string' };
      }
    }
  }

  const videoCount = blocks.filter((b) => b.type === 'video').length;
  if (videoCount > 10) {
    return { valid: false, message: '동영상은 최대 10개까지 추가할 수 있습니다' };
  }

  return { valid: true };
}
