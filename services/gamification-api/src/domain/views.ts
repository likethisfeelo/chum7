/**
 * 조회 응답 구성 — 순수 로직 (AWS 무의존).
 * 이식: backend/services/badge/list, character/status, character/collection,
 * character/next 핸들러의 응답 가공부. 필드명·형태는 레거시 계약 그대로.
 */
import { MYTHOLOGY_CHARACTERS, MYTHOLOGY_LINES, MythologyLine } from './character-constants';
import type { CharacterRecord } from './character-slot';

// ── 뱃지 목록 (레거시 badge/list) ──────────────────────────────────────────

/** gamification 테이블 뱃지 아이템에서 목록 응답에 쓰는 속성 */
export interface BadgeRecordLike {
  badgeId: string;
  grantedAt?: string;
  challengeId?: string | null;
  verificationId?: string | null;
  sourceDay?: unknown;
  sourceConsecutiveDays?: unknown;
}

export interface BadgeView {
  badgeId: string;
  grantedAt: string | undefined;
  challengeId: string | null;
  verificationId: string | null;
  sourceDay: number | null;
  sourceConsecutiveDays: number | null;
}

/**
 * 레거시 badge/list의 매핑(누락 필드 null 기본값) + 최신순 정렬.
 * 레거시는 ScanIndexForward:false로 최신순이었으나 신규 sk(BADGE#<badgeId>)는
 * 시간순이 아니므로 grantedAt 내림차순 정렬로 동일 순서를 보장한다.
 */
export function toBadgeListView(items: BadgeRecordLike[]): BadgeView[] {
  return items
    .map((item) => ({
      badgeId: item.badgeId,
      grantedAt: item.grantedAt,
      challengeId: item.challengeId || null,
      verificationId: item.verificationId || null,
      sourceDay: typeof item.sourceDay === 'number' ? item.sourceDay : null,
      sourceConsecutiveDays:
        typeof item.sourceConsecutiveDays === 'number' ? item.sourceConsecutiveDays : null,
    }))
    .sort((a, b) => (b.grantedAt ?? '').localeCompare(a.grantedAt ?? ''));
}

// ── 세계관 진행 상황 (레거시 character/status) ─────────────────────────────

export type MythologyProgress = Record<
  string,
  { total: number; completed: number; isCompleted: boolean }
>;

/** 세계관별 완성 캐릭터 수 집계 (status=complete만) */
export function countCompletedByLine(
  characters: Array<Pick<CharacterRecord, 'mythologyLine' | 'status'>>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ch of characters) {
    if (ch.status !== 'complete') continue;
    counts[ch.mythologyLine] = (counts[ch.mythologyLine] ?? 0) + 1;
  }
  return counts;
}

/** 세계관별 진행 응답 (빈 집계 전달 시 레거시 buildEmptyProgress와 동일) */
export function buildMythologyProgress(
  completedCountByLine: Record<string, number>,
): MythologyProgress {
  const result: MythologyProgress = {};
  for (const line of MYTHOLOGY_LINES) {
    const total = MYTHOLOGY_CHARACTERS[line].length;
    const completed = completedCountByLine[line] ?? 0;
    result[line] = { total, completed, isCompleted: completed >= total };
  }
  return result;
}

// ── 컬렉션 (레거시 character/collection) ───────────────────────────────────

export interface CollectionView {
  completed: Array<{
    characterId: string;
    mythologyLine: string;
    characterType: string;
    count: number;
    completedAt: string | null;
  }>;
  inProgress: Array<{
    characterId: string;
    mythologyLine: string;
    characterType: string;
    filledCount: number;
  }>;
}

export function buildCollectionView(characters: CharacterRecord[]): CollectionView {
  // 완성된 것: 중복 수 포함 모두 반환 / 진행 중인 것: 최대 1개 (레거시 주석 그대로)
  const completed = characters.filter((ch) => ch.status === 'complete');
  const inProgress = characters.filter((ch) => ch.status === 'in_progress');

  const countByType: Record<string, number> = {};
  for (const ch of completed) {
    countByType[ch.characterType] = (countByType[ch.characterType] ?? 0) + 1;
  }

  return {
    completed: completed.map((ch) => ({
      characterId: ch.characterId,
      mythologyLine: ch.mythologyLine,
      characterType: ch.characterType,
      count: countByType[ch.characterType] ?? 1,
      completedAt: ch.completedAt ?? null,
    })),
    inProgress: inProgress.map((ch) => ({
      characterId: ch.characterId,
      mythologyLine: ch.mythologyLine,
      characterType: ch.characterType,
      filledCount: ch.filledCount ?? 0,
    })),
  };
}

// ── 다음 캐릭터 타입 선택 (레거시 character/next) ──────────────────────────

/**
 * 요청 타입이 해당 세계관 소속이면 그대로, 아니면 아직 완성 안 한 첫 캐릭터,
 * 모두 완성했으면 첫 캐릭터 (레거시 분기 그대로 — 중복 보유 허용).
 */
export function pickNextCharacterType(
  line: MythologyLine,
  completedTypes: ReadonlySet<string>,
  requested?: string,
): string {
  const characters = MYTHOLOGY_CHARACTERS[line] as readonly string[];
  if (requested && characters.includes(requested)) return requested;
  return characters.find((t) => !completedTypes.has(t)) ?? characters[0]!;
}
