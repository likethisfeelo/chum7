import { apiClient } from '@/lib/api-client';

export type LayerCategory =
  | 'selflove' | 'attitude' | 'discipline' | 'build'
  | 'explore' | 'create' | 'expand' | 'impact';

export interface WorldLayer {
  category: LayerCategory;
  floor: string;         // 'B2' | 'B1' | 'G1' ... 'G6'
  label: string;         // 'Selflove' | 'Attitude' ...
  questScore: number;    // 0–100 (완료 인증 수, 최대 100)
  cheerScore: number;    // 누적 응원 점수
  thankScore: number;    // 누적 감사 점수
  todayQuestDelta: number; // 오늘 새로 완료한 인증 수
}

export interface WorldSummary {
  layers: WorldLayer[];
  totals: {
    questScore: number;
    cheerScore: number;
    thankScore: number;
  };
}

export const worldApi = {
  // 개인 여정(누적) 요약 — 인증 필요. 내 참여 레코드를 카테고리(8층)별로 누적.
  // (구 /public/today/world-summary: 전체 공개·오늘 집계 — 유지되나 개인 화면은 아래 사용)
  getSummary: async (): Promise<WorldSummary> => {
    const res = await apiClient.get('/g/world/summary');
    return res.data.data as WorldSummary;
  },
};
