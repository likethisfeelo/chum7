import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

type AuditLog = {
  auditType: string;
  actorId: string;
  action: string;
  targetId: string;
  questId?: string;
  note?: string | null;
  createdAt: string;
};

const ACTION_TABS = [
  { key: 'all',           label: '전체' },
  { key: 'approved',      label: '승인' },
  { key: 'rejected',      label: '거절' },
  { key: 'auto_approved', label: '자동승인' },
] as const;

type ActionTab = typeof ACTION_TABS[number]['key'];

const ACTION_LABEL: Record<string, string> = {
  approved:      '승인',
  rejected:      '거절',
  auto_approved: '자동승인',
};

const formatDate = (iso: string) => format(new Date(iso), 'M월 d일 HH:mm:ss', { locale: ko });

const shortId = (id?: string) => (id ? id.slice(0, 8) : '-');

const statusBadgeClass: Record<string, string> = {
  approved:      'bg-green-100 text-green-700',
  rejected:      'bg-red-100 text-red-700',
  auto_approved: 'bg-blue-100 text-blue-700',
};

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

export const AdminAuditLogsPage = () => {
  const [actionFilter, setActionFilter] = useState<ActionTab>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-audit-logs', actionFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '30' });
      if (actionFilter !== 'all') params.set('action', actionFilter);
      if (dateFrom) params.set('from', new Date(dateFrom).toISOString());
      if (dateTo)   params.set('to',   new Date(dateTo).toISOString());
      const res = await apiClient.get(`/admin/audit/logs?${params}`);
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
      const params = new URLSearchParams({ limit: '30', nextToken });
      if (actionFilter !== 'all') params.set('action', actionFilter);
      if (dateFrom) params.set('from', new Date(dateFrom).toISOString());
      if (dateTo)   params.set('to',   new Date(dateTo).toISOString());
      const res = await apiClient.get(`/admin/audit/logs?${params}`);
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
          <p className="text-sm text-gray-500 mt-1">퀘스트 심사 승인/거절 이력을 시간순으로 확인합니다.</p>
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

      {/* 액션 필터 */}
      <div className="flex flex-wrap gap-2">
        {ACTION_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActionFilter(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              actionFilter === tab.key
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 날짜 범위 필터 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">시작 날짜</label>
          <input
            type="datetime-local"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">종료 날짜</label>
          <input
            type="datetime-local"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => { setDateFrom(''); setDateTo(''); }}
          className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          초기화
        </button>
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
                  <th className="text-left px-4 py-3 font-semibold">검토자</th>
                  <th className="text-left px-4 py-3 font-semibold">제출ID</th>
                  <th className="text-left px-4 py-3 font-semibold">퀘스트ID</th>
                  <th className="text-left px-4 py-3 font-semibold">메모</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={`${log.targetId}-${log.createdAt}`} className="border-b border-gray-100 last:border-0 align-top">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadgeClass[log.action] || 'bg-gray-100 text-gray-700'}`}>
                        {ACTION_LABEL[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs whitespace-nowrap">
                      {shortId(log.actorId)}
                      <CopyButton text={log.actorId} />
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs whitespace-nowrap">
                      {shortId(log.targetId)}
                      <CopyButton text={log.targetId} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">
                      {log.questId ? (
                        <>
                          {shortId(log.questId)}
                          <CopyButton text={log.questId} />
                        </>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-pre-wrap">{log.note || '-'}</td>
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
