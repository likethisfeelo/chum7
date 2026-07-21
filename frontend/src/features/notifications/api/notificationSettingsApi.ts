import { apiClient } from '@/lib/api-client';

export interface QuietHours {
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  enabled: boolean;
}

export interface NotificationSettings {
  category_challenge: boolean;
  category_quest: boolean;
  category_cheer: boolean;
  category_feed_social: boolean;
  category_feed_badge: boolean;
  category_bulletin: boolean;
  category_challenge_board: boolean;
  category_plaza: boolean;
  /** 방해금지 시간 (기본 22:00~08:00 ON) */
  quietHours?: QuietHours;
  /** 응원은 방해금지에도 받기 (기본 ON) */
  cheerBypassQuietHours?: boolean;
  [key: string]: boolean | QuietHours | undefined;
}

export const notificationSettingsApi = {
  getSettings: async (): Promise<NotificationSettings> => {
    const res = await apiClient.get('/u/notifications/settings');
    return res.data.data.settings;
  },

  updateSettings: async (updates: Partial<NotificationSettings>): Promise<void> => {
    await apiClient.put('/u/notifications/settings', updates);
  },
};
