/**
 * 해시태그 순수 로직 — 정규화·추출.
 * 레거시 규칙 승계: backend/services/verification/submit (hashtag 필드 정규식
 * `/^[가-힣a-zA-Z0-9_-]*$/`, 최대 30자, 선행 `#` 제거).
 */

export const HASHTAG_MAX_LENGTH = 30;

const HASHTAG_BODY_RE = /^[가-힣a-zA-Z0-9_-]+$/;

/** 선행 `#` 제거 + trim. 유효하지 않으면 null (레거시 clean 규칙 승계) */
export function normalizeHashtag(raw?: string | null): string | null {
  if (!raw) return null;
  const clean = String(raw).replace(/^#+/, '').trim();
  if (!clean) return null;
  if (clean.length > HASHTAG_MAX_LENGTH) return null;
  if (!HASHTAG_BODY_RE.test(clean)) return null;
  return clean;
}

/**
 * 본문에서 `#태그` 추출 (중복 제거, 등장 순서 유지).
 * 게시물 작성 시 TAG# 레지스트리 유지 + gsi2pk=`TAG#<tag>` 기록에 사용.
 */
export function extractHashtags(text?: string | null): string[] {
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const re = /#([가-힣a-zA-Z0-9_-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(text))) !== null) {
    const tag = normalizeHashtag(match[1]);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    found.push(tag);
  }
  return found;
}

/**
 * 게시물의 대표 해시태그 결정 — 명시 필드 우선, 없으면 본문 첫 태그.
 * (gsi2pk는 아이템당 1개이므로 대표 태그 1개만 피드 인덱싱)
 */
export function resolvePrimaryHashtag(
  explicit: string | null | undefined,
  content: string | null | undefined,
): { primary: string | null; all: string[] } {
  const extracted = extractHashtags(content);
  const explicitClean = normalizeHashtag(explicit);
  const all = [...extracted];
  if (explicitClean && !all.includes(explicitClean)) all.unshift(explicitClean);
  return { primary: explicitClean ?? extracted[0] ?? null, all };
}
