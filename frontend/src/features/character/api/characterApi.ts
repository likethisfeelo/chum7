import { apiClient } from '@/lib/api-client';

export type MythologyLine = 'korean' | 'greek' | 'norse';

export interface CharacterSlot {
  slotIndex: number;
  badgeId: string;
  challengeId: string;
  filledAt: string;
}

export interface ActiveCharacter {
  characterId: string;
  mythologyLine: MythologyLine;
  characterType: string;
  filledCount: number;
  totalSlots: number;
  slots: CharacterSlot[];
  status: 'in_progress' | 'complete';
}

export interface MythologyProgress {
  total: number;
  completed: number;
  isCompleted: boolean;
}

export interface CharacterStatus {
  onboardingDone: boolean;
  activeMythology: MythologyLine | null;
  activeCharacter: ActiveCharacter | null;
  mythologyProgress: Record<MythologyLine, MythologyProgress>;
  completedMythologies: MythologyLine[];
  themeOverride: MythologyLine | null;
}

export interface CollectionCharacter {
  characterId: string;
  mythologyLine: MythologyLine;
  characterType: string;
  count: number;
  completedAt: string | null;
}

export interface CharacterCollection {
  completed: CollectionCharacter[];
  inProgress: Array<{
    characterId: string;
    mythologyLine: MythologyLine;
    characterType: string;
    filledCount: number;
  }>;
}

export const characterApi = {
  getStatus: async (): Promise<CharacterStatus> => {
    const res = await apiClient.get('/characters/me/status');
    return res.data.data as CharacterStatus;
  },

  start: async (mythologyLine: MythologyLine): Promise<ActiveCharacter & { totalSlots: number }> => {
    const res = await apiClient.post('/characters/me/start', { mythologyLine });
    return res.data.data;
  },

  next: async (params?: { mythologyLine?: MythologyLine; characterType?: string }): Promise<ActiveCharacter & { totalSlots: number }> => {
    const res = await apiClient.post('/characters/me/next', params ?? {});
    return res.data.data;
  },

  getCollection: async (): Promise<CharacterCollection> => {
    const res = await apiClient.get('/characters/me/collection');
    return res.data.data as CharacterCollection;
  },

  setTheme: async (mythology: MythologyLine | null): Promise<void> => {
    await apiClient.put('/characters/me/theme', { mythology });
  },
};
