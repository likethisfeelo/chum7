/**
 * 오늘 탭 월드(8층) 집계 — 순수 로직 (AWS 무의존).
 * 이식: backend/services/today/world-summary/index.ts 의 층 정의·KST 계산·집계부.
 *
 * 신 구조에서는 challenges 테이블 gsi2(VFPUB#<YYYY-MM-DD>, KST)의 "당일 공개 인증"만
 * 읽기 전용으로 조회해 카테고리별로 집계한다 (크로스 도메인 예외 §4).
 */

export const LAYER_ORDER = [
  { category: 'selflove',       floor: 'B2', label: 'Selflove'   },
  { category: 'attitude',  floor: 'B1', label: 'Attitude'   },
  { category: 'discipline',        floor: 'G1', label: 'Discipline' },
  { category: 'build', floor: 'G2', label: 'Build'      },
  { category: 'explore',   floor: 'G3', label: 'Explore'    },
  { category: 'create',  floor: 'G4', label: 'Create'     },
  { category: 'expand',       floor: 'G5', label: 'Expand'     },
  { category: 'impact',       floor: 'G6', label: 'Impact'     },
] as const;

export type CategoryKey = typeof LAYER_ORDER[number]['category'];

/** KST(UTC+9) 기준 오늘 날짜 문자열 (gsi2pk=VFPUB#<YYYY-MM-DD> 조회 키) */
export function kstDateString(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 당일 공개 인증 아이템에서 집계에 쓰는 속성 */
export interface PublicVerificationLike {
  /** 레거시 verification 아이템의 카테고리 속성명 */
  challengeCategory?: string | null;
  /** 대체 속성명 허용 */
  category?: string | null;
  /** 하루 완료 인증만 1 (레거시 score=1 필터 승계) */
  score?: number;
}

export interface WorldLayer {
  category: CategoryKey;
  floor: string;
  label: string;
  questScore: number;
  cheerScore: number;
  thankScore: number;
  todayQuestDelta: number;
}

export interface WorldSummary {
  layers: WorldLayer[];
  totals: { questScore: number; cheerScore: number; thankScore: number };
}

/**
 * 당일 공개 인증을 카테고리별로 집계해 레거시와 동일한 층/층수 응답 형태를 만든다.
 * - todayQuestDelta: score=1 인증 수 (레거시 오늘 delta 집계 승계)
 * - questScore: min(100, 당일 집계) — 레거시와 동일하게 100 상한
 * - cheerScore/thankScore: 공개 인증 스트림에서 파생 불가 → 0 유지 (필드 형태 보존, PORTING.md 참조)
 */
export function aggregateWorldSummary(items: PublicVerificationLike[]): WorldSummary {
  const todayDelta: Record<string, number> = {};
  for (const v of items) {
    if ((typeof v.score === 'number' ? v.score : 1) !== 1) continue;
    const cat = v.challengeCategory ?? v.category;
    if (!cat) continue;
    todayDelta[cat] = (todayDelta[cat] ?? 0) + 1;
  }

  const layers: WorldLayer[] = LAYER_ORDER.map((l) => {
    const delta = todayDelta[l.category] ?? 0;
    return {
      category: l.category,
      floor: l.floor,
      label: l.label,
      questScore: Math.min(100, delta),
      cheerScore: 0,
      thankScore: 0,
      todayQuestDelta: delta,
    };
  });

  const totals = layers.reduce(
    (acc, l) => ({
      questScore: acc.questScore + l.questScore,
      cheerScore: acc.cheerScore + l.cheerScore,
      thankScore: acc.thankScore + l.thankScore,
    }),
    { questScore: 0, cheerScore: 0, thankScore: 0 },
  );

  return { layers, totals };
}

// ── 개인 여정 누적 집계 (참여 레코드 기반, 인증 필요) ──────────────────────────

function toNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export interface UserWorldInput {
  /** 유저 참여 레코드 (challengeId + score/cheerScore/thankScore) */
  participations: Array<Record<string, unknown>>;
  /** challengeId → 카테고리 */
  categoryByChallenge: Record<string, string | null>;
  /** 유저 당일 인증 (challengeCategory/category + score) */
  todayVerifications: Array<Record<string, unknown>>;
}

/**
 * 유저의 참여 레코드를 카테고리(8층)별로 누적해 개인 여정 요약을 만든다.
 * - questScore: 참여 score(퀘스트 완료 누적) 합, 층당 100 상한 (레거시 표시 규칙 승계)
 * - cheerScore/thankScore: 참여 누적 합 (score-rules 적립분)
 * - todayQuestDelta: 당일 완료 인증(score=1) 카테고리별 수
 */
export function aggregateUserWorld(input: UserWorldInput): WorldSummary {
  const quest: Record<string, number> = {};
  const cheer: Record<string, number> = {};
  const thank: Record<string, number> = {};
  const today: Record<string, number> = {};

  for (const p of input.participations) {
    const cid = typeof p.challengeId === 'string' ? p.challengeId : '';
    const cat = cid ? input.categoryByChallenge[cid] : null;
    if (!cat) continue;
    quest[cat] = (quest[cat] ?? 0) + toNum(p.score);
    cheer[cat] = (cheer[cat] ?? 0) + toNum(p.cheerScore);
    thank[cat] = (thank[cat] ?? 0) + toNum(p.thankScore);
  }

  for (const v of input.todayVerifications) {
    if (toNum(v.score, 1) !== 1) continue;
    const cat =
      (typeof v.challengeCategory === 'string' && v.challengeCategory) ||
      (typeof v.category === 'string' ? v.category : '');
    if (!cat) continue;
    today[cat] = (today[cat] ?? 0) + 1;
  }

  const layers: WorldLayer[] = LAYER_ORDER.map((l) => ({
    category: l.category,
    floor: l.floor,
    label: l.label,
    questScore: Math.min(100, quest[l.category] ?? 0),
    cheerScore: cheer[l.category] ?? 0,
    thankScore: thank[l.category] ?? 0,
    todayQuestDelta: today[l.category] ?? 0,
  }));

  const totals = layers.reduce(
    (acc, l) => ({
      questScore: acc.questScore + l.questScore,
      cheerScore: acc.cheerScore + l.cheerScore,
      thankScore: acc.thankScore + l.thankScore,
    }),
    { questScore: 0, cheerScore: 0, thankScore: 0 },
  );

  return { layers, totals };
}
