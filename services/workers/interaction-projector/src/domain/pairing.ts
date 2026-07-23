/**
 * interaction-projector 순수 도메인 — 도메인 이벤트를 "사용자쌍 상호작용"으로 변환하고
 * 추천 점수를 계산한다. AWS 접근 없음(전부 순수 함수) — 테스트 용이.
 *
 * 설계 근거: docs/relationship-archive-design.md §3·§4.
 */

export type InteractionType =
  | 'comment'
  | 'reply'
  | 'reaction'
  | 'cheer'
  | 'co_challenge'
  | 'plaza_meet';

export interface PairInteraction {
  actorUserId: string;
  targetUserId: string;
  interactionType: InteractionType;
  contextType: string; // challenge | plaza | board | verification
  contextId: string | null;
  sourceEntityType: string;
  sourceEntityId: string | null;
  /** 작성 당시 actor 공개 활동명(아무개N·수달N·챌린지 리더) — 타임라인 스냅샷. 없으면 null */
  actorDisplayName: string | null;
  /** 원장 멱등 키 — 같은 이벤트 재수신 시 동일해야 한다 */
  interactionId: string;
}

/** 쌍 키 정규화 — 사전순 min/max로 한 파티션에 모음 */
export function pairKey(a: string, b: string): { lo: string; hi: string } {
  return a < b ? { lo: a, hi: b } : { lo: b, hi: a };
}

/** 상호작용 유형별 집계 속성명 */
export const COUNT_ATTR: Record<InteractionType, string> = {
  comment: 'commentCount',
  reply: 'replyCount',
  reaction: 'reactionCount',
  cheer: 'cheerCount',
  co_challenge: 'sharedChallengeCount',
  plaza_meet: 'plazaMeetCount',
};

/** 추천 점수 가중치 (초기값 — docs/relationship-archive-design.md §4) */
export const WEIGHTS: Record<InteractionType, number> = {
  co_challenge: 3,
  comment: 2,
  reply: 2,
  reaction: 1,
  cheer: 2,
  plaza_meet: 1,
};

/** 이 점수 미만이면 추천 후보에서 제외(gsi1 미기록) */
export const RECOMMEND_THRESHOLD = 3;

/**
 * challenge.completed 팬아웃 상한 — 완주자 N명이면 N*(N-1)/2 쌍이 생겨 Lambda가
 * 타임아웃될 수 있다. 완주자를 이 수로 제한(초과분은 co_challenge 쌍에서 제외).
 * 25명 → 300쌍(안전). 초과 시 index 핸들러가 드롭 수를 로깅한다.
 */
export const MAX_CO_CHALLENGE_USERS = 25;

export interface PairStatLike {
  sharedChallengeCount?: number;
  commentCount?: number;
  replyCount?: number;
  reactionCount?: number;
  cheerCount?: number;
  plazaMeetCount?: number;
  lastInteractionAt?: string | null;
}

/** 최근성 가산 — 최근일수록 가점 (7일 +2, 30일 +1) */
export function recencyBoost(lastInteractionAt: string | null | undefined, nowMs: number): number {
  if (!lastInteractionAt) return 0;
  const last = Date.parse(lastInteractionAt);
  if (Number.isNaN(last)) return 0;
  const days = (nowMs - last) / 86_400_000;
  if (days <= 7) return 2;
  if (days <= 30) return 1;
  return 0;
}

/** 사용자쌍 집계 → 추천 점수 */
export function scorePair(stat: PairStatLike, nowMs: number): number {
  const base =
    WEIGHTS.co_challenge * (stat.sharedChallengeCount ?? 0) +
    WEIGHTS.comment * (stat.commentCount ?? 0) +
    WEIGHTS.reply * (stat.replyCount ?? 0) +
    WEIGHTS.reaction * (stat.reactionCount ?? 0) +
    WEIGHTS.cheer * (stat.cheerCount ?? 0) +
    WEIGHTS.plaza_meet * (stat.plazaMeetCount ?? 0);
  return Math.max(0, base + recencyBoost(stat.lastInteractionAt, nowMs));
}

/** 추천 정렬용 gsi1sk — 점수 내림차순을 문자열 오름차순으로 뒤집기 위해 제로패딩 */
export function scoreSortKey(score: number, otherUserId: string): string {
  const padded = String(Math.min(999_999, Math.max(0, Math.round(score)))).padStart(6, '0');
  return `${padded}#${otherUserId}`;
}

/** 도메인 이벤트 → 사용자쌍 상호작용 목록 (본인-본인 제외) */
export function interactionsFromEvent(
  type: string,
  detail: Record<string, any>,
): PairInteraction[] {
  const occurredAt = String(detail.occurredAt ?? '');

  switch (type) {
    case 'comment.created': {
      const actor = String(detail.authorId ?? '');
      const target = String(detail.targetOwnerId ?? '');
      if (!actor || !target || actor === target) return [];
      return [
        {
          actorUserId: actor,
          targetUserId: target,
          interactionType: 'comment',
          contextType: String(detail.targetType ?? 'unknown'),
          contextId: detail.targetId ?? null,
          sourceEntityType: 'comment',
          sourceEntityId: detail.commentId ?? null,
          actorDisplayName: detail.actorDisplayName ? String(detail.actorDisplayName) : null,
          interactionId: String(detail.commentId ?? `cmt:${actor}:${target}:${occurredAt}`),
        },
      ];
    }
    case 'reaction.created': {
      const actor = String(detail.actorUserId ?? '');
      const target = String(detail.targetOwnerId ?? '');
      if (!actor || !target || actor === target) return [];
      return [
        {
          actorUserId: actor,
          targetUserId: target,
          interactionType: 'reaction',
          contextType: String(detail.targetType ?? 'unknown'),
          contextId: detail.targetId ?? null,
          sourceEntityType: 'reaction',
          sourceEntityId: detail.targetId ?? null,
          actorDisplayName: null,
          interactionId: `rx:${actor}:${detail.targetId ?? ''}:${occurredAt}`,
        },
      ];
    }
    case 'cheer.delivered': {
      const actor = String(detail.senderId ?? '');
      const target = String(detail.receiverId ?? '');
      if (!actor || !target || actor === target) return [];
      return [
        {
          actorUserId: actor,
          targetUserId: target,
          interactionType: 'cheer',
          contextType: 'challenge',
          contextId: detail.challengeId ?? null,
          sourceEntityType: 'cheer',
          sourceEntityId: detail.cheerId ?? null,
          actorDisplayName: null,
          interactionId: String(detail.cheerId ?? `cheer:${actor}:${target}:${occurredAt}`),
        },
      ];
    }
    case 'challenge.completed': {
      const all: string[] = Array.isArray(detail.completedUserIds) ? detail.completedUserIds : [];
      // 팬아웃 상한 — 초과 완주자는 co_challenge 쌍 생성에서 제외(개인 집계엔 영향 없음)
      const users = all.slice(0, MAX_CO_CHALLENGE_USERS);
      const challengeId = String(detail.challengeId ?? '');
      const out: PairInteraction[] = [];
      for (let i = 0; i < users.length; i += 1) {
        for (let j = i + 1; j < users.length; j += 1) {
          const a = String(users[i]);
          const b = String(users[j]);
          if (!a || !b || a === b) continue;
          out.push({
            actorUserId: a,
            targetUserId: b,
            interactionType: 'co_challenge',
            contextType: 'challenge',
            contextId: challengeId,
            sourceEntityType: 'challenge',
            sourceEntityId: challengeId,
            actorDisplayName: null,
            // 챌린지·쌍당 1건 — 재완료 이벤트에도 멱등
            interactionId: `cc:${challengeId}:${a < b ? a : b}:${a < b ? b : a}`,
          });
        }
      }
      return out;
    }
    default:
      return [];
  }
}
