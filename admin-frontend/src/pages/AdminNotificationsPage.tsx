import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const formatDate = (iso?: string) => {
  if (!iso) return '';
  try {
    return format(new Date(iso), 'M월 d일 HH:mm', { locale: ko });
  } catch {
    return iso;
  }
};

export const AdminNotificationsPage = () => {
  const { data, refetch } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: async () => {
      const res = await apiClient.get('/users/me/notifications');
      return res.data.data || [];
    },
    refetchInterval: 30000,
  });

  const notifications = Array.isArray(data) ? data : [];
  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  const readMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.patch(`/users/me/notifications/${notificationId}/read`);
    },
    onSuccess: () => refetch(),
  });

  const markAllRead = async () => {
    for (const n of notifications.filter((n: any) => !n.isRead)) {
      await readMutation.mutateAsync(n.notificationId);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">알림함</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-blue-600 mt-0.5">읽지 않은 알림 {unreadCount}개</p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm">새로고침</button>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="px-3 py-2 rounded-lg bg-gray-200 text-gray-800 text-sm">모두 읽음</button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
          <p className="text-3xl mb-2">🔔</p>
          <p>알림이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any) => (
            <div
              key={n.notificationId}
              onClick={() => !n.isRead && readMutation.mutate(n.notificationId)}
              className={`flex items-start gap-3 rounded-xl p-4 border cursor-pointer transition-colors ${
                n.isRead
                  ? 'bg-white border-gray-200 hover:bg-gray-50'
                  : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
              }`}
            >
              <div className="flex-shrink-0 mt-1.5">
                {n.isRead ? (
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${n.isRead ? 'text-gray-700' : 'text-blue-900'}`}>{n.title}</p>
                <p className="text-sm text-gray-600 mt-0.5">{n.body}</p>
                <p className="text-xs text-gray-400 mt-1">{formatDate(n.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
