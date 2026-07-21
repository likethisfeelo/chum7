import { z } from 'zod';

/** POST /g/characters/me/start (레거시 character/start 스키마 그대로) */
export const startCharacterSchema = z.object({
  mythologyLine: z.enum(['korean', 'greek', 'norse']),
});

/** POST /g/characters/me/next (레거시 character/next 스키마 그대로) */
export const nextCharacterSchema = z.object({
  // 같은 세계관에서 계속할 경우 characterType 선택 가능,
  // 다른 세계관으로 전환할 경우 mythologyLine 지정
  mythologyLine: z.enum(['korean', 'greek', 'norse']).optional(),
  characterType: z.string().optional(),
});

/** PUT /g/characters/me/theme (레거시 character/theme 스키마 그대로) */
export const themeSchema = z.object({
  mythology: z.enum(['korean', 'greek', 'norse']).nullable(),
});
