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
  deletion_request: '마당 삭제 요청',
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
  targetOwnerId?: string | null;
  contentPreview?: string | null;
  autoHidden?: boolean;
  createdAt: string;
};

/** 같은 대상(targetType#targetId)의 신고를 한 카드로 묶는다 */
type ReportGroup = {
  key: string;
  targetType: Report['targetType'];
  targetId: string;
  reports: Report[]; // 최신순
  latest: Report;
  reasons: string[];
  autoHidden: boolean;
};

function groupReports(reports: Report[]): ReportGroup[] {
  const map = new Map<string, ReportGroup>();
  for (const r of reports) {
    const key = `${r.targetType}#${r.targetId}`;
    const g = map.get(key);
    if (g) {
      g.reports.push(r);
      if (!g.reasons.includes(r.reason)) g.reasons.push(r.reason);
      g.autoHidden = g.autoHidden || r.autoHidden === true;
    } else {
      map.set(key, {
        key,
        targetType: r.targetType,
        targetId: r.targetId,
        reports: [r],
        latest: r,
        reasons: [r.reason],
        autoHidden: r.autoHidden === true,
      });
    }
  }
  return [...map.values()];
}

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

  const groups = groupReports(reports);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-reports'] });
  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  };

  // 숨김 확정 — 인증은 챌린지 피드 원본도 숨긴 뒤(챌린지API), 그룹 전체를 actioned로 일괄 종결
  const hideMutation = useMutation({
    mutationFn: async (g: ReportGroup) => {
      if (g.targetType === 'verification') {
        await apiClient.put(`/c/mod/verifications/${g.targetId}/hide`, {
          challengeId: g.latest.challengeId,
        });
      }
      const res = await apiClient.put('/s/mod/reports/resolve-by-target', {
        targetType: g.targetType,
        targetId: g.targetId,
        ...(g.targetType === 'comment'
          ? { plazaPostId: g.latest.plazaPostId, commentCreatedAt: g.latest.commentCreatedAt }
          : {}),
        status: 'actioned',
      });
      return res.data;
    },
    onSuccess: (data) => {
      flash(data?.message || '콘텐츠를 숨기고 신고를 처리했어요.');
      invalidate();
    },
    onError: () => flash('처리에 실패했어요. 권한/입력을 확인하세요.'),
  });

  // 반려 — 그룹 전체 dismissed + 접수 시 자동숨김분은 마당에 자동 복원
  const dismissMutation = useMutation({
    mutationFn: async (g: ReportGroup) => {
      const res = await apiClient.put('/s/mod/reports/resolve-by-target', {
        targetType: g.targetType,
        targetId: g.targetId,
        ...(g.targetType === 'comment'
          ? { plazaPostId: g.latest.plazaPostId, commentCreatedAt: g.latest.commentCreatedAt }
          : {}),
        status: 'dismissed',
      });
      return res.data;
    },
    onSuccess: (data) => {
      flash(data?.message || '신고를 반려했어요.');
      invalidate();
    },
    onError: () => flash('처리에 실패했어요.'),
  });

  const busyKey =
    (hideMutation.isPending && hideMutation.variables?.key) ||
    (dismissMutation.isPending && dismissMutation.variables?.key) ||
    null;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">신고 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          마당 콘텐츠(마당글·댓글·마당에 공유된 인증)는 신고 접수 즉시 마당에서 자동숨김됩니다.
          반려하면 마당에 복원되고, 숨김 확정 시 그대로 유지됩니다. 숨겨도 게시자 본인 프로필/기록에는 남습니다.
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
      {!isLoading && groups.length === 0 && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-400">
          신고가 없습니다.
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => {
          const busy = busyKey === g.key;
          const pendingCount = g.reports.filter((r) => r.status === 'pending').length;
          return (
            <div key={g.key} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[g.latest.status] ?? 'bg-gray-100'}`}
                >
                  {FILTER_TABS.find((t) => t.key === g.latest.status)?.label ?? g.latest.status}
                </span>
                <span className="text-xs font-semibold text-gray-700">{TARGET_LABEL[g.targetType] ?? g.targetType}</span>
                {g.reports.length > 1 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                    🚩 {g.reports.length}건
                  </span>
                )}
                {g.autoHidden && g.latest.status === 'pending' && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                    마당 자동숨김됨
                  </span>
                )}
                <span className="ml-auto text-[11px] text-gray-400">
                  {new Date(g.latest.createdAt).toLocaleString('ko-KR')}
                </span>
              </div>

              <div className="flex gap-1.5 flex-wrap mt-1">
                {g.reasons.map((reason) => (
                  <span key={reason} className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                    {REASON_LABEL[reason] ?? reason}
                  </span>
                ))}
              </div>

              {g.latest.contentPreview && (
                <p className="text-sm text-gray-800 mt-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
                  {g.latest.contentPreview}
                </p>
              )}
              {g.latest.detail && (
                <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-wrap">신고 사유: {g.latest.detail}</p>
              )}
              <p className="text-[11px] text-gray-400 mt-1 break-all">
                대상 ID: {g.targetId}
                {g.latest.challengeId ? ` · challenge: ${g.latest.challengeId}` : ''}
                {g.latest.targetOwnerId ? ` · 작성자: ${g.latest.targetOwnerId}` : ''}
              </p>

              {pendingCount > 0 && (
                <div className="flex gap-2 mt-3 items-center">
                  <button
                    onClick={() => hideMutation.mutate(g)}
                    disabled={busy}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    숨김 확정 + 처리완료
                  </button>
                  <button
                    onClick={() => dismissMutation.mutate(g)}
                    disabled={busy}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    반려{g.autoHidden ? ' (마당 복원)' : ''}
                  </button>
                  {pendingCount > 1 && (
                    <span className="text-[11px] text-gray-400">대기 {pendingCount}건 일괄 처리</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
