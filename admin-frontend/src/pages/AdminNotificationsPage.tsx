import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

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
      <h1 className="text-2xl font-bold">알림함</h1>
      <div className="flex gap-2">
        <button onClick={() => refetch()} className="px-3 py-2 rounded bg-slate-900 text-white">새로고침</button>
        <button onClick={markAllRead} className="px-3 py-2 rounded bg-gray-200 text-gray-800">모두 읽음</button>
      </div>
      {notifications.map((n: any) => (
        <div key={n.notificationId} className="bg-white border rounded-xl p-4 cursor-pointer" onClick={() => readMutation.mutate(n.notificationId)}>
          <p className="font-semibold">{n.title}</p>
          <p className="text-sm text-gray-600">{n.body}</p>
          <p className="text-xs text-gray-400">{n.createdAt}</p>
        </div>
      ))}
    </div>
  );
};
