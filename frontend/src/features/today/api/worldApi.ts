import { apiClient } from '@/lib/api-client';

export type LayerCategory =
  | 'health' | 'mindfulness' | 'habit' | 'relationship'
  | 'creativity' | 'development' | 'expand' | 'impact';

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
  getSummary: async (): Promise<WorldSummary> => {
    const res = await apiClient.get('/today/world-summary');
    return res.data.data as WorldSummary;
  },
};
