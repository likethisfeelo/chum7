export const MYTHOLOGY_CHARACTERS = {
  korean: ['웅녀', '호랑이', '이무기', '도깨비', '봉황'] as const,
  greek:  ['아테나', '페넬로페', '프로메테우스'] as const,
  norse:  ['이그드라실', '발키리', '토르'] as const,
} as const;

export type MythologyLine = keyof typeof MYTHOLOGY_CHARACTERS;
export type CharacterType = typeof MYTHOLOGY_CHARACTERS[MythologyLine][number];

export const MYTHOLOGY_LINES: MythologyLine[] = ['korean', 'greek', 'norse'];

export const MYTHOLOGY_META: Record<MythologyLine, { label: string; theme: string; description: string }> = {
  korean: { label: '한국 신화', theme: 'korean', description: '변신과 수련의 서사. 5개의 캐릭터를 완성하세요.' },
  greek:  { label: '그리스 신화', theme: 'greek',  description: '의지와 지혜의 서사. 3개의 캐릭터를 완성하세요.' },
  norse:  { label: '북유럽 신화', theme: 'norse',  description: '자연과 강인함의 서사. 3개의 캐릭터를 완성하세요.' },
};

export const CHARACTER_META: Record<string, { emoji: string; badge: string; description: string }> = {
  '웅녀':      { emoji: '🐻', badge: '🧄', description: '100일을 버텨 사람이 된 곰. 시작의 캐릭터' },
  '호랑이':    { emoji: '🐯', badge: '🌿', description: '버티지 못했지만 자유로웠던 존재' },
  '이무기':    { emoji: '🐍', badge: '💫', description: '천 년을 묵묵히 기다려 승천' },
  '도깨비':    { emoji: '👺', badge: '🌱', description: '매일 밤 쌓아올리는 반복의 존재' },
  '봉황':      { emoji: '🦅', badge: '🔥', description: '재에서 다시 태어나는 재도전' },
  '아테나':    { emoji: '🦉', badge: '🦉', description: '지식·독서 챌린지에 강한 지혜의 캐릭터' },
  '페넬로페':  { emoji: '🧵', badge: '🧵', description: '매일 짜고 풀어도 포기 안 한 기다림' },
  '프로메테우스': { emoji: '⛓️', badge: '🔥', description: '금지를 넘었다가 대가를 치름. 도전 실패 서사' },
  '이그드라실': { emoji: '🌳', badge: '🍃', description: '모든 세계를 연결하는 세계수. 꾸준함' },
  '발키리':    { emoji: '🪶', badge: '🪶', description: '새벽·아침형 챌린지 특화' },
  '토르':      { emoji: '⚡', badge: '⚡', description: '운동·강인함 챌린지' },
};

export const SLOTS_PER_CHARACTER = 7;
