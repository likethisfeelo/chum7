/**
 * plaza-converter 순수 매핑 로직 (AWS 무의존).
 * 공개 인증(challenges gsi2 `VFPUB#<KST date>`) → 마당(courtyard) 게시물 아이템.
 * 아이템 계약: services/social-api/PORTING.md §4 (repo/plaza.buildPostKeys 동일 키 규칙).
 * 콘텐츠 폴백: backend/shared/lib/plaza-convert-content.ts 승계 (동작 변경 금지).
 */

export type PlazaFallbackContentSource =
  | 'todayNote'
  | 'tomorrowPromise'
  | 'generatedDay'
  | 'generatedDefault';

/** 사본: backend/shared/lib/plaza-convert-content.resolvePlazaFallbackContent (동작 변경 금지) */
export function resolvePlazaFallbackContent(
  item: Record<string, any>,
): { content: string; source: PlazaFallbackContentSource } {
  const normalizedTodayNote = typeof item.todayNote === 'string' ? item.todayNote.trim() : '';
  const normalizedTomorrowPromise = typeof item.tomorrowPromise === 'string' ? item.tomorrowPromise.trim() : '';

  if (normalizedTodayNote) return { content: normalizedTodayNote, source: 'todayNote' };
  if (normalizedTomorrowPromise) return { content: normalizedTomorrowPromise, source: 'tomorrowPromise' };

  if (item.day !== undefined && item.day !== null) {
    const parsedDay = Number(item.day);
    if (Number.isFinite(parsedDay) && parsedDay > 0) {
      return { content: `Day ${Math.floor(parsedDay)} 인증을 완료했어요.`, source: 'generatedDay' };
    }
  }

  return { content: '인증을 완료했어요.', source: 'generatedDefault' };
}

// ── 조회 윈도우 ─────────────────────────────────────────────────────────

/** KST(UTC+9) 날짜 문자열 — gsi2pk=`VFPUB#<YYYY-MM-DD>` 파티션 키 (world-summary와 동일 계산) */
export function kstDateString(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const DEFAULT_LOOKBACK_HOURS = 26;

export interface ConversionWindow {
  /** Query 대상 파티션 — KST 오늘 + 어제 (자정 경계 시간대 커버) */
  partitions: string[];
  /** high-water mark — gsi2sk(createdAt) > sinceIso 만 조회 (시간별 실행 전제, 이전 실행분 재조회 최소화) */
  sinceIso: string;
}

export function conversionWindow(now: Date, lookbackHours = DEFAULT_LOOKBACK_HOURS): ConversionWindow {
  const today = kstDateString(now);
  const yesterday = kstDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  return {
    partitions: [today, yesterday],
    sinceIso: new Date(now.getTime() - lookbackHours * 60 * 60 * 1000).toISOString(),
  };
}

// ── 인증 아이템 키 (challenge-api repo/verifications.verificationSk 계약) ──

/** 인증 sk — `VF#<userId>#D<dd>#<verificationId>` (verification.submitted 즉시 변환 Get 키) */
export function verificationSkOf(userId: string, day: number, verificationId: string): string {
  return `VF#${userId}#D${String(Math.floor(day)).padStart(2, '0')}#${verificationId}`;
}

// ── 변환 판정 ───────────────────────────────────────────────────────────

export type ConvertDecision =
  | { convert: true }
  | { convert: false; reason: 'not_normal_type' | 'already_converted' };

/**
 * 변환 대상 판정 — 레거시 승계: type=normal만, 변환 마커 있으면 스킵.
 * (공개 여부는 gsi2 VFPUB# 파티션 자체가 보장 — 공개 인증만 키가 기록된다.)
 */
export function decideConvert(verification: Record<string, any>): ConvertDecision {
  if (verification.type !== 'normal') return { convert: false, reason: 'not_normal_type' };
  if (verification.plazaConvertedAt) return { convert: false, reason: 'already_converted' };
  return { convert: true };
}

// ── 게시물 아이템 매핑 (social-api PORTING.md §4 계약 그대로) ────────────

export function plazaPostIdOf(verificationId: string): string {
  return `courtyard-${verificationId}`;
}

export function buildPlazaPostItem(
  verification: Record<string, any>,
  convertedAt: string,
): Record<string, any> {
  const plazaPostId = plazaPostIdOf(String(verification.verificationId));
  const createdAt: string = verification.createdAt || convertedAt;
  const hashtag = typeof verification.hashtag === 'string' && verification.hashtag ? verification.hashtag : null;

  return {
    pk: `POST#${plazaPostId}`,
    sk: 'META',
    gsi1pk: 'FEED#courtyard',
    gsi1sk: createdAt,
    ...(hashtag ? { gsi2pk: `TAG#${hashtag}`, gsi2sk: createdAt } : {}),

    plazaPostId,
    postType: 'courtyard',
    challengeTitle: verification.challengeTitle || '챌린지 기록',
    challengeCategory: verification.challengeCategory || null,
    currentDay: verification.day || null,
    imageUrl: verification.imageUrl || verification.videoUrl || null,
    // 슬라이드용 다중 이미지 (마당에서도 인스타 슬라이드로 노출). 없으면 단일에서 파생.
    imageUrls: Array.isArray(verification.imageUrls) && verification.imageUrls.length
      ? verification.imageUrls
      : [verification.imageUrl || verification.videoUrl].filter(Boolean),
    content: resolvePlazaFallbackContent(verification).content,
    leaderId: null,
    leaderName: null,
    leaderMessage: null,
    recruitmentData: null,
    sourceType: 'verification',
    sourceId: verification.verificationId,
    sourceChallengeId: verification.challengeId || undefined,
    sourceLeaderId: verification.leaderId || undefined,
    sourceUserId: verification.userId || null,
    likeCount: 0, // 신규 테이블 기준 0에서 시작 (RCT# 재계산과 정합 — 계약 §4)
    commentCount: 0,
    bookmarkCount: 0,
    isActive: true,
    createdAt,
    originalCreatedAt: verification.createdAt || null,
    convertedAt,
    ...(hashtag ? { hashtag } : {}),
  };
}

// ── 해시태그 레지스트리 (social repo/hashtags.registerHashtag 계약) ──────

const ANIMALS = ['🐰', '🐻', '🦊', '🐼', '🦁', '🐯', '🐨', '🦦'] as const;

/** 레거시 verification/submit의 최초 등록자 동물 아이콘 시드 (userId 문자합 mod 8) */
export function animalIconFor(userId: string): string {
  const iconSum = [...userId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return ANIMALS[iconSum % ANIMALS.length] as string;
}

/** TAG#<tag>/META 최초 등록 아이템 (이미 있으면 조건부 Put 실패 — postCount 증분만 수행) */
export function buildHashtagRegistryItem(
  hashtag: string,
  creatorUserId: string,
  now: string,
): Record<string, any> {
  return {
    pk: `TAG#${hashtag}`,
    sk: 'META',
    gsi1pk: 'TAGREG',
    gsi1sk: now,
    hashtag,
    creatorUserId,
    creatorAnimalIcon: animalIconFor(creatorUserId),
    registeredAt: now,
    creatorPublic: true,
    postCount: 0,
  };
}
