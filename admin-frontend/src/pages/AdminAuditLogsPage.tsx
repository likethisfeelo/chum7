import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

// 신규 감사 저장소 (admin-api PORTING.md §1-E): GET /adm/audit?month=YYYY-MM / GET /adm/audit/target/:targetId
type AuditLog = {
  auditId: string;
  actorUserId: string;
  action: string;
  target?: { type?: string; id?: string } | null;
  payloadSummary?: string | null;
  createdAt: string;
};

const ACTION_LABEL: Record<string, string> = {
  'challenge.create': '챌린지 생성',
  'challenge.update': '챌린지 수정',
  'challenge.delete': '챌린지 삭제',
  'challenge.toggle': '챌린지 활성 전환',
  'challenge.lifecycle': '라이프사이클 변경',
  'challenge.confirm-start': '시작 확정',
  'quest.review': '퀘스트 심사',
  'banner.create': '배너 생성',
  'banner.activate': '배너 활성화',
  'banner.delete': '배너 삭제',
  'cheer.dlq.requeue': '응원 DLQ 재발송',
  'cheer.dlq.requeue-batch': '응원 DLQ 일괄 재발송',
  'cheer.dlq.requeue-by-query': '응원 DLQ 조건 재발송',
  'coupon.issue': '쿠폰 발급',
  'coupon.revoke': '쿠폰 회수',
  'order.confirm': '입금 확인',
  'order.reject': '입금 거절',
};

const actionBadgeClass = (action: string) => {
  if (action.startsWith('challenge.')) return 'bg-indigo-100 text-indigo-700';
  if (action.startsWith('quest.')) return 'bg-green-100 text-green-700';
  if (action.startsWith('banner.')) return 'bg-amber-100 text-amber-700';
  if (action.startsWith('cheer.')) return 'bg-purple-100 text-purple-700';
  if (action.startsWith('coupon.') || action.startsWith('order.')) return 'bg-rose-100 text-rose-700';
  return 'bg-gray-100 text-gray-700';
};

const formatDate = (iso: string) => {
  try { return format(new Date(iso), 'M월 d일 HH:mm:ss', { locale: ko }); } catch { return iso; }
};

const shortId = (id?: string) => (id ? id.slice(0, 8) : '-');

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="ml-1 text-gray-400 hover:text-gray-700 transition-colors text-xs"
      title="클립보드 복사"
    >
      {copied ? '✓' : '⎘'}
    </button>
  );
};

const currentMonth = () => new Date().toISOString().slice(0, 7);

export const AdminAuditLogsPage = () => {
  const [month, setMonth] = useState(currentMonth());
  const [targetInput, setTargetInput] = useState('');
  const [targetId, setTargetId] = useState(''); // 확정된 대상 검색어 (비어있으면 월 조회)
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);

  const buildUrl = (token?: string | null) => {
    const params = new URLSearchParams({ limit: '30' });
    if (token) params.set('nextToken', token);
    if (targetId) return `/adm/audit/target/${encodeURIComponent(targetId)}?${params}`;
    params.set('month', month);
    return `/adm/audit?${params}`;
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-audit-logs', month, targetId],
    queryFn: async () => {
      const res = await apiClient.get(buildUrl());
      return res.data.data;
    },
    retry: false,
  });

  useEffect(() => {
    setLogs(data?.logs ?? []);
    setNextToken(data?.nextToken ?? null);
  }, [data]);

  const loadMoreMutation = useMutation({
    mutationFn: async () => {
      if (!nextToken) return null;
      const res = await apiClient.get(buildUrl(nextToken));
      return res.data.data;
    },
    onSuccess: (pageData) => {
      if (!pageData) return;
      setLogs((prev) => [...prev, ...(pageData.logs ?? [])]);
      setNextToken(pageData.nextToken ?? null);
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '감사 로그를 더 불러오지 못했습니다');
    },
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">감사 로그</h1>
          <p className="text-sm text-gray-500 mt-1">어드민 변이 액션 이력을 월 단위 또는 대상 ID로 조회합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-4 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-50"
        >
          {isFetching ? '갱신 중...' : '새로고침'}
        </button>
      </div>

      {/* 조회 조건 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">조회 월</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
            disabled={Boolean(targetId)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
          />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-gray-500 mb-1">대상 ID 검색 (챌린지·제출물·쿠폰 등)</label>
          <input
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            placeholder="targetId를 입력하면 월 조회 대신 대상별 이력을 조회합니다"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setTargetId(targetInput.trim())}
          disabled={!targetInput.trim()}
          className="px-3 py-2 text-sm rounded-lg bg-primary-600 text-white disabled:opacity-50"
        >
          대상 조회
        </button>
        <button
          type="button"
          onClick={() => { setTargetInput(''); setTargetId(''); }}
          className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          초기화
        </button>
        {targetId && (
          <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1">
            대상별 조회 중: {targetId}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500">로그를 불러오는 중...</div>
      ) : logs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">표시할 감사 로그가 없습니다.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">시각</th>
                  <th className="text-left px-4 py-3 font-semibold">액션</th>
                  <th className="text-left px-4 py-3 font-semibold">행위자</th>
                  <th className="text-left px-4 py-3 font-semibold">대상</th>
                  <th className="text-left px-4 py-3 font-semibold">요약</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.auditId || `${log.createdAt}-${log.action}`} className="border-b border-gray-100 last:border-0 align-top">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${actionBadgeClass(log.action)}`}>
                        {ACTION_LABEL[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs whitespace-nowrap">
                      {shortId(log.actorUserId)}
                      <CopyButton text={log.actorUserId} />
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs whitespace-nowrap">
                      {log.target?.type ? <span className="text-gray-400">{log.target.type} · </span> : null}
                      {shortId(log.target?.id)}
                      {log.target?.id && <CopyButton text={log.target.id} />}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-md">
                      <span className="break-all whitespace-pre-wrap">{log.payloadSummary || '-'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 flex justify-center border-t border-gray-100 bg-gray-50">
            <button
              type="button"
              disabled={!nextToken || loadMoreMutation.isPending}
              onClick={() => loadMoreMutation.mutate()}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 disabled:opacity-40"
            >
              {loadMoreMutation.isPending ? '불러오는 중...' : nextToken ? '더 보기' : '끝까지 불러왔습니다'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
