import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';

export const AdminOpsDashboardPage = () => {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-stats-overview'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/stats/overview');
      return res.data.data;
    },
  });


  const { data: notifications } = useQuery({
    queryKey: ['admin-notification-unread-count'],
    queryFn: async () => {
      const res = await apiClient.get('/users/me/notifications');
      return res.data.data || [];
    },
    refetchInterval: 30000,
  });
  const unreadCount = Array.isArray(notifications) ? notifications.filter((n: any) => !n.isRead).length : 0;

  if (isLoading) {
    return <div className="p-6 text-gray-500">운영 지표를 불러오는 중...</div>;
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          운영 지표를 불러오지 못했습니다.
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 px-4 py-2 rounded-lg bg-gray-900 text-white"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const cards = [
    { label: '총 사용자', value: data.totalUsers },
    { label: '총 챌린지', value: data.totalChallenges },
    { label: '총 참여', value: data.totalParticipations },
    { label: '심사 대기', value: data.operations?.pendingReviewCount ?? 0 },
    { label: '거절률(%)', value: data.operations?.reviewRejectRate ?? 0 },
    { label: '최근 7일 인증', value: data.verifications?.recent7DaysCount ?? 0 },
    { label: 'Remedy 인증', value: data.verifications?.remedyCount ?? 0 },
    { label: '추가 인증', value: data.verifications?.extraCount ?? 0 },
  ];

  const daily = data.verifications?.verificationDaily || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">운영 안정화 대시보드</h1>
          <p className="text-sm text-gray-500 mt-1">승인 큐/인증 추세/리스크 지표를 빠르게 확인합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/audit/logs')}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700"
          >
            감사 로그 보기
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/notifications')}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700"
          >
            알림함 {unreadCount > 0 ? `(${unreadCount})` : ''}
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-50"
          >
            {isFetching ? '갱신 중...' : '새로고침'}
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="font-bold text-gray-900 mb-2">최근 7일 인증 추세</h2>
        {daily.length === 0 ? (
          <p className="text-sm text-gray-500">표시할 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {daily.map((d: any) => (
              <div key={d.date} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{d.date}</span>
                <span className="font-semibold text-gray-900">{d.count}건</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-gray-400">기준 시각: {data.timestamp}</p>
    </div>
  );
};
