/**
 * 오늘 탭 월드(8층) 집계 — 순수 로직 (AWS 무의존).
 * 이식: backend/services/today/world-summary/index.ts 의 층 정의·KST 계산·집계부.
 *
 * 신 구조에서는 challenges 테이블 gsi2(VFPUB#<YYYY-MM-DD>, KST)의 "당일 공개 인증"만
 * 읽기 전용으로 조회해 카테고리별로 집계한다 (크로스 도메인 예외 §4).
 */

export const LAYER_ORDER = [
  { category: 'health',       floor: 'B2', label: 'Selflove'   },
  { category: 'mindfulness',  floor: 'B1', label: 'Attitude'   },
  { category: 'habit',        floor: 'G1', label: 'Discipline' },
  { category: 'relationship', floor: 'G2', label: 'Build'      },
  { category: 'creativity',   floor: 'G3', label: 'Explore'    },
  { category: 'development',  floor: 'G4', label: 'Create'     },
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
