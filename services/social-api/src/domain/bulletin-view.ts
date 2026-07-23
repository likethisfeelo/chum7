/**
 * 불레틴 퍼블릭 뷰 — 챌린지 표면은 익명(정체성 사다리).
 * 응답에서 실 userId를 절대 노출하지 않고, 작성 당시 활동명(수달N) 스냅샷 + isMine만 준다.
 * 순수 함수(IO 없음) — 프라이버시 불변식을 테스트로 고정한다.
 */
import { createDailyAnonymousId } from '@chum7/core';

/** 응답에서 제거할 속성 — 내부 키 + 실 userId */
const OMIT_ATTRS = new Set(['pk', 'sk', 'gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk', 'userId']);

/** 작성 당시 활동명 스냅샷 — 없으면 createdAt 날짜 기준 재계산(하위호환) */
export function bulletinDisplayName(item: Record<string, any>, salt: string): string {
  if (item.authorDisplayName) return String(item.authorDisplayName);
  if (!item.userId || !item.challengeId) return '익명';
  try {
    return createDailyAnonymousId(
      String(item.challengeId),
      String(item.userId),
      salt,
      new Date(item.createdAt ?? Date.now()),
    );
  } catch {
    return '익명';
  }
}

/** 게시글/댓글 아이템 → 퍼블릭 뷰(userId 제거 + displayName·isMine 부여) */
export function bulletinView(
  item: Record<string, any>,
  viewerId: string | undefined,
  salt: string,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(item)) {
    if (!OMIT_ATTRS.has(k)) out[k] = v;
  }
  out.displayName = bulletinDisplayName(item, salt);
  out.isMine = Boolean(viewerId) && item.userId === viewerId;
  return out;
}
