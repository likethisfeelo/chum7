import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';

export const AdminOpsDashboardPage = () => {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-stats-overview'],
    queryFn: async () => {
      const res = await apiClient.get('/adm/stats/overview');
      return res.data.data;
    },
  });


  const { data: notifications } = useQuery({
    queryKey: ['admin-notification-unread-count'],
    queryFn: async () => {
      const res = await apiClient.get('/u/notifications');
      return res.data?.data?.notifications ?? [];
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

  // 신규 stats는 Query 산출 가능 지표만 제공 — 미집계 지표는 null (PORTING.md §1-E)
  const dash = (v: unknown) => (v === null || v === undefined ? '—' : Number(v));
  const pendingCount = data.operations?.pendingReviewCount ?? null;

  const cards = [
    { label: '총 사용자', value: dash(data.totalUsers), alert: false },
    { label: '총 챌린지', value: dash(data.totalChallenges), alert: false },
    { label: '총 참여', value: dash(data.totalParticipations), alert: false },
    { label: '심사 대기', value: dash(pendingCount), alert: Number(pendingCount ?? 0) > 0 },
    { label: '거절률(%)', value: dash(data.operations?.reviewRejectRate), alert: false },
    { label: '최근 7일 인증', value: dash(data.verifications?.recent7DaysCount), alert: false },
    { label: 'Remedy 인증', value: dash(data.verifications?.remedyCount), alert: false },
    { label: '추가 인증', value: dash(data.verifications?.extraCount), alert: false },
  ];

  const daily: Array<{ date: string; count: number }> = data.verifications?.verificationDaily || [];
  const maxCount = daily.length > 0 ? Math.max(...daily.map((d) => d.count), 1) : 1;

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
          <div
            key={card.label}
            className={`border rounded-xl p-4 ${card.alert ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'}`}
          >
            <p className={`text-xs ${card.alert ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.alert ? 'text-red-700' : 'text-gray-900'}`}>{card.value}</p>
            {card.alert && <p className="text-xs text-red-600 mt-1">⚠️ 심사 대기 중</p>}
          </div>
        ))}
      </section>
      <section className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4 space-y-1">
        <h2 className="font-bold text-gray-500">광장 리뉴얼(즉시 변환) — 재구축 후 지원 예정</h2>
        <p className="text-sm text-gray-500">
          즉시 변환 트리거는 plaza-converter 워커로 이관되어 백엔드 재구축 후 지원 예정입니다.
        </p>
      </section>


      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="font-bold text-gray-900 mb-4">최근 7일 인증 추세</h2>
        {daily.length === 0 ? (
          <p className="text-sm text-gray-500">표시할 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {daily.map((d) => {
              const pct = maxCount > 0 ? Math.round((d.count / maxCount) * 100) : 0;
              return (
                <div key={d.date} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-20 flex-shrink-0">{d.date}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-800 w-12 text-right">{d.count}건</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-xs text-gray-400">기준 시각: {data.timestamp}</p>
    </div>
  );
};
