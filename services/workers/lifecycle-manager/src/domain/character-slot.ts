// 사본: services/gamification-api/src/domain/character-slot.ts (서비스 간 import 금지 원칙 — 동작 변경 금지)
/**
 * 캐릭터 슬롯 채우기 — 순수 상태 전이 로직 (AWS 무의존).
 * 이식: backend/shared/lib/character-slot.ts (fillCharacterSlot / checkMythologyCompletion)의 판정부.
 *
 * 저장(UpdateCommand)·알림 발행은 호출자(lifecycle-manager 워커 또는 라우트)가 수행한다.
 */
import {
  MYTHOLOGY_CHARACTERS,
  CHARACTER_META,
  MythologyLine,
  SLOTS_PER_CHARACTER,
} from './character-constants';
import type { NotificationIntent } from './leader-badge-grant';

export const MYTHOLOGY_NAME: Record<string, string> = {
  korean: '한국 신화',
  greek: '그리스 신화',
  norse: '북유럽 신화',
};

export interface CharacterSlot {
  slotIndex: number;
  badgeId: string;
  challengeId: string;
  filledAt: string;
}

export interface CharacterRecord {
  characterId: string;
  userId: string;
  mythologyLine: MythologyLine;
  characterType: string;
  slots: CharacterSlot[];
  filledCount: number;
  status: 'in_progress' | 'complete';
  createdAt: string;
  completedAt?: string;
}

export type SlotFillDecision =
  /** 활성 캐릭터 없음 → pendingSlotFills += 1 (다음 캐릭터 선택 시 소급) */
  | { action: 'accumulatePending' }
  /** 캐릭터 없음/진행 중 아님/이미 가득 참 → 변경 없음 */
  | { action: 'none'; reason: 'character_missing' | 'not_in_progress' | 'already_full' }
  /** 슬롯 1개 추가 */
  | { action: 'fill'; slots: CharacterSlot[]; filledCount: number }
  /** 7번째 슬롯 → 캐릭터 완성 (activeCharacterId 초기화 + 세계관 완성 체크 필요) */
  | {
      action: 'complete';
      slots: CharacterSlot[];
      filledCount: number;
      completedAt: string;
      notification: NotificationIntent;
    };

/** 챌린지 완주 1건에 대한 슬롯 채우기 판정 (레거시 fillCharacterSlot 분기 그대로) */
export function decideSlotFill(params: {
  userId: string;
  challengeId: string;
  /** 사용자 상태에 activeCharacterId가 있는지 */
  hasActiveCharacterId: boolean;
  /** activeCharacterId로 조회한 캐릭터 (없으면 null) */
  activeCharacter: CharacterRecord | null;
  /** 새 슬롯에 부여할 badgeId (uuid) */
  badgeId: string;
  now: string;
}): SlotFillDecision {
  const { userId, challengeId, hasActiveCharacterId, activeCharacter, badgeId, now } = params;

  if (!hasActiveCharacterId) return { action: 'accumulatePending' };
  if (!activeCharacter) return { action: 'none', reason: 'character_missing' };
  if (activeCharacter.status !== 'in_progress') return { action: 'none', reason: 'not_in_progress' };

  const currentSlots = activeCharacter.slots ?? [];
  if (currentSlots.length >= SLOTS_PER_CHARACTER) return { action: 'none', reason: 'already_full' };

  const newSlot: CharacterSlot = {
    slotIndex: currentSlots.length,
    badgeId,
    challengeId,
    filledAt: now,
  };
  const updatedSlots = [...currentSlots, newSlot];
  const newFilledCount = updatedSlots.length;

  if (newFilledCount >= SLOTS_PER_CHARACTER) {
    const meta = CHARACTER_META[activeCharacter.characterType];
    const emoji = meta?.emoji ?? '✨';
    return {
      action: 'complete',
      slots: updatedSlots,
      filledCount: newFilledCount,
      completedAt: now,
      notification: {
        recipientId: userId,
        type: 'character_complete',
        title: `${emoji} ${activeCharacter.characterType} 완성!`,
        body: `${MYTHOLOGY_NAME[activeCharacter.mythologyLine] ?? activeCharacter.mythologyLine}의 ${activeCharacter.characterType}를 완성했어요. 다음 캐릭터를 선택해보세요!`,
        relatedId: activeCharacter.characterId,
        relatedType: 'character',
      },
    };
  }

  return { action: 'fill', slots: updatedSlots, filledCount: newFilledCount };
}

/**
 * 세계관 완성 여부 판정 (레거시 checkMythologyCompletion의 카운트 비교부).
 * completedCount에는 방금 완성된 캐릭터를 포함해 센다.
 */
export function isMythologyCompleted(mythologyLine: string, completedCount: number): boolean {
  const total = MYTHOLOGY_CHARACTERS[mythologyLine as MythologyLine]?.length;
  if (!total) return false;
  return completedCount >= total;
}

/** 세계관 완성 알림 페이로드 (레거시 문구 유지) */
export function buildMythologyCompleteNotification(
  userId: string,
  mythologyLine: string,
): NotificationIntent {
  return {
    recipientId: userId,
    type: 'mythology_complete',
    title: `🎉 ${MYTHOLOGY_NAME[mythologyLine] ?? mythologyLine} 완성!`,
    body: `세계관의 모든 캐릭터를 완성했어요! 테마 스킨이 해금됐어요.`,
    relatedId: userId,
    relatedType: 'user',
  };
}

/**
 * 대기 구간(pendingSlotFills) 소급 적용 슬롯 구성 (레거시 character/next 핸들러의 소급부).
 * badgeIds는 최소 min(pendingCount, SLOTS_PER_CHARACTER)개 필요.
 */
export function buildPendingSlotFill(
  pendingCount: number,
  now: string,
  badgeIds: string[],
): { slots: CharacterSlot[]; filledCount: number; isComplete: boolean } {
  const pending = Math.min(pendingCount, SLOTS_PER_CHARACTER);
  const slots: CharacterSlot[] = Array.from({ length: pending }, (_, i) => ({
    slotIndex: i,
    badgeId: badgeIds[i] ?? '',
    challengeId: 'pending', // 대기 구간 슬롯 마커
    filledAt: now,
  }));
  return { slots, filledCount: pending, isComplete: pending >= SLOTS_PER_CHARACTER };
}
