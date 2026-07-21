/**
 * 익명 ID 생성 — 레거시 backend/services/challenge-feed/_shared/common.ts 이식
 * (docs/challenge-feed-anonymous-id-spec.md v1). 동작 변경 금지:
 * 사전(16개 동물)·해시 슬라이스·KST 날짜 키 그대로.
 * 순수 함수화: salt를 인자로 받고, env 접근은 salt 로더 래퍼에서만.
 */
import { createHash } from 'crypto';

export const ANIMAL_DICTIONARY = [
  '고래', '수달', '여우', '참새', '돌고래', '해달', '호랑이', '판다',
  '늑대', '펭귄', '매', '고양이', '강아지', '알파카', '사슴', '기린',
];

/** KST(Asia/Seoul) YYYY-MM-DD — 익명 ID 날짜 경계는 서비스 정책상 KST 고정 (spec §4) */
export function toKstDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function seedToId(seed: string): string {
  const animalIndex = parseInt(seed.slice(0, 8), 16) % ANIMAL_DICTIONARY.length;
  const number = (parseInt(seed.slice(8, 16), 16) % 900) + 100;
  return `${ANIMAL_DICTIONARY[animalIndex]}-${number}`;
}

/** 일별 익명 ID (챌린지 진행 중) — seed = SHA256(cid:uid:dateKey:salt) */
export function createDailyAnonymousId(
  challengeId: string,
  userId: string,
  salt: string,
  date = new Date(),
): string {
  if (!salt) throw new Error('ANON_SALT_NOT_CONFIGURED');
  const source = `${challengeId}:${userId}:${toKstDateKey(date)}:${salt}`;
  return seedToId(createHash('sha256').update(source).digest('hex'));
}

/** 챌린지 종료 후 안정적 익명 ID (날짜 무관) — seed = SHA256(cid:uid:persistent:salt) */
export function createPersistentAnonymousId(
  challengeId: string,
  userId: string,
  salt: string,
): string {
  if (!salt) throw new Error('ANON_SALT_NOT_CONFIGURED');
  const source = `${challengeId}:${userId}:persistent:${salt}`;
  return seedToId(createHash('sha256').update(source).digest('hex'));
}

/** env ANON_ID_SALT 로더 — 미설정 시 레거시와 동일하게 throw */
export function anonSaltFromEnv(): string {
  const salt = process.env.ANON_ID_SALT;
  if (!salt) throw new Error('ANON_SALT_NOT_CONFIGURED');
  return salt;
}
