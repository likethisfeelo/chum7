import { apiClient } from '@/lib/api-client';

export interface NotificationSettings {
  category_challenge: boolean;
  category_quest: boolean;
  category_cheer: boolean;
  category_feed_social: boolean;
  category_feed_badge: boolean;
  category_bulletin: boolean;
  category_challenge_board: boolean;
  category_plaza: boolean;
  [key: string]: boolean;
}

export const notificationSettingsApi = {
  getSettings: async (): Promise<NotificationSettings> => {
    const res = await apiClient.get('/notifications/settings');
    return res.data.data.settings;
  },

  updateSettings: async (updates: Partial<NotificationSettings>): Promise<void> => {
    await apiClient.put('/notifications/settings', updates);
  },
};
