import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

const FILTER_TABS = [
  { key: 'pending', label: '대기' },
  { key: 'actioned', label: '조치완료' },
  { key: 'dismissed', label: '반려' },
  { key: 'all', label: '전체' },
] as const;

const REASON_LABEL: Record<string, string> = {
  spam: '스팸/광고',
  harassment: '욕설/괴롭힘',
  sexual: '음란물/선정성',
  violence: '폭력/위협',
  hate: '혐오 발언',
  misinfo: '허위정보',
  other: '기타',
};

const TARGET_LABEL: Record<string, string> = {
  verification: '퀘스트 인증',
  plaza: '마당 게시물',
  comment: '댓글',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  actioned: 'bg-emerald-100 text-emerald-700',
  dismissed: 'bg-gray-200 text-gray-600',
};

type Report = {
  reportId: string;
  status: string;
  targetType: 'verification' | 'plaza' | 'comment';
  targetId: string;
  challengeId?: string | null;
  plazaPostId?: string | null;
  commentCreatedAt?: string | null;
  reason: string;
  detail?: string | null;
  reporterId: string;
  createdAt: string;
};

export const AdminReportsPage = () => {
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [msg, setMsg] = useState('');
  const qc = useQueryClient();

  const { data: reports = [], isLoading, isError } = useQuery({
    queryKey: ['admin-reports', statusFilter],
    queryFn: async () => {
      const res = await apiClient.get(`/s/mod/reports?status=${statusFilter}`);
      return res.data.data.reports as Report[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-reports'] });

  // 대상 콘텐츠 숨기기 (타입별 디스패치)
  const hideMutation = useMutation({
    mutationFn: async (r: Report) => {
      if (r.targetType === 'verification') {
        await apiClient.put(`/c/mod/verifications/${r.targetId}/hide`, { challengeId: r.challengeId });
      } else if (r.targetType === 'plaza') {
        await apiClient.post(`/s/mod/plaza/${r.targetId}/hide`);
      } else {
        await apiClient.post('/s/mod/comments/hide', {
          plazaPostId: r.plazaPostId,
          commentId: r.targetId,
          commentCreatedAt: r.commentCreatedAt,
        });
      }
      await apiClient.put(`/s/mod/reports/${r.reportId}`, { createdAt: r.createdAt, status: 'actioned' });
    },
    onSuccess: () => {
      setMsg('콘텐츠를 숨기고 신고를 처리했어요.');
      setTimeout(() => setMsg(''), 3000);
      invalidate();
    },
    onError: () => setMsg('처리에 실패했어요. 권한/입력을 확인하세요.'),
  });

  const dismissMutation = useMutation({
    mutationFn: async (r: Report) => {
      await apiClient.put(`/s/mod/reports/${r.reportId}`, { createdAt: r.createdAt, status: 'dismissed' });
    },
    onSuccess: () => {
      setMsg('신고를 반려했어요.');
      setTimeout(() => setMsg(''), 3000);
      invalidate();
    },
    onError: () => setMsg('처리에 실패했어요.'),
  });

  const busyId =
    (hideMutation.isPending && hideMutation.variables?.reportId) ||
    (dismissMutation.isPending && dismissMutation.variables?.reportId) ||
    null;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">신고 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          사용자 신고를 검토하고 콘텐츠를 숨깁니다. 숨겨도 게시자 본인 프로필/기록에는 남습니다.
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        {FILTER_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              statusFilter === t.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && <p className="text-sm text-emerald-600 font-medium mb-3">{msg}</p>}
      {isLoading && <p className="text-sm text-gray-500">불러오는 중...</p>}
      {isError && <p className="text-sm text-red-500">목록을 불러오지 못했습니다.</p>}
      {!isLoading && reports.length === 0 && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-400">
          신고가 없습니다.
        </div>
      )}

      <div className="space-y-3">
        {reports.map((r) => {
          const busy = busyId === r.reportId;
          return (
            <div key={r.reportId} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] ?? 'bg-gray-100'}`}>
                  {FILTER_TABS.find((t) => t.key === r.status)?.label ?? r.status}
                </span>
                <span className="text-xs font-semibold text-gray-700">{TARGET_LABEL[r.targetType] ?? r.targetType}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                  {REASON_LABEL[r.reason] ?? r.reason}
                </span>
                <span className="ml-auto text-[11px] text-gray-400">{new Date(r.createdAt).toLocaleString('ko-KR')}</span>
              </div>
              {r.detail && <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.detail}</p>}
              <p className="text-[11px] text-gray-400 mt-1 break-all">
                대상 ID: {r.targetId}
                {r.challengeId ? ` · challenge: ${r.challengeId}` : ''}
              </p>

              {r.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => hideMutation.mutate(r)}
                    disabled={busy}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    숨기기 + 처리완료
                  </button>
                  <button
                    onClick={() => dismissMutation.mutate(r)}
                    disabled={busy}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    반려
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
