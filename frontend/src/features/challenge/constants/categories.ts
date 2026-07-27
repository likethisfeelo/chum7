export const CHALLENGE_CATEGORIES = [
  { slug: 'selflove',       label: 'Selflove',   color: 'bg-red-100 text-red-600',       emoji: '💗' },
  { slug: 'attitude',  label: 'Attitude',   color: 'bg-yellow-100 text-yellow-600', emoji: '🔥' },
  { slug: 'discipline',        label: 'Discipline', color: 'bg-yellow-100 text-yellow-600', emoji: '⚡' },
  { slug: 'explore',   label: 'Explore',    color: 'bg-teal-100 text-teal-600',     emoji: '🧭' },
  { slug: 'create',  label: 'Create',     color: 'bg-blue-100 text-blue-600',     emoji: '🎨' },
  { slug: 'build', label: 'Build',      color: 'bg-indigo-100 text-indigo-600', emoji: '🏗️' },
  { slug: 'expand',       label: 'Expand',     color: 'bg-purple-100 text-purple-600', emoji: '🌱' },
  { slug: 'impact',       label: 'Impact',     color: 'bg-green-100 text-green-600',   emoji: '🚀' },
] as const;

export type CategorySlug = (typeof CHALLENGE_CATEGORIES)[number]['slug'];

export const SLUG_TO_LABEL: Record<string, string> = Object.fromEntries(
  CHALLENGE_CATEGORIES.map((c) => [c.slug, c.label]),
);

export const SLUG_TO_COLOR: Record<string, string> = Object.fromEntries(
  CHALLENGE_CATEGORIES.map((c) => [c.slug, c.color]),
);

export const SLUG_TO_EMOJI: Record<string, string> = Object.fromEntries(
  CHALLENGE_CATEGORIES.map((c) => [c.slug, c.emoji]),
);

// 타이틀/텍스트 색상용 hex (카테고리별)
export const SLUG_TO_HEX: Record<string, string> = {
  selflove: '#D46A6A',
  attitude: '#E0A05A',
  discipline: '#D8B36A',
  explore: '#3FB0A0',
  create: '#5B8DEF',
  build: '#6E78E0',
  expand: '#9D8CCF',
  impact: '#46B36B',
};

export const DEFAULT_BANNERS: Record<string, { tagline: string; description: string }> = {
  selflove:       { tagline: 'Love yourself first',          description: '나를 가장 먼저 돌보는 작은 습관들' },
  attitude:  { tagline: 'Your mindset is everything',   description: '태도가 결과를 만든다' },
  discipline:        { tagline: 'Show up. Every. Single. Day.',  description: '매일 조금씩, 결국엔 멀리' },
  explore:   { tagline: 'Dare to discover',             description: '새로운 경험이 당신을 넓힌다' },
  create:  { tagline: 'Make something that matters',  description: '아이디어를 현실로 꺼내는 시간' },
  build: { tagline: 'Build something that lasts',   description: '지금 이 순간을 쌓아가는 것들' },
  expand:       { tagline: 'Growth has no limits',         description: '당신의 가능성을 더 넓게' },
  impact:       { tagline: 'Leave a mark',                 description: '세상에 흔적을 남기는 도전' },
};
