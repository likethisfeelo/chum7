import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const STATUS_BADGE: Record<string, string> = {
  pending:            'bg-amber-100 text-amber-700',
  sent:               'bg-green-100 text-green-700',
  receiver_completed: 'bg-purple-100 text-purple-700',
  failed:             'bg-red-100 text-red-700',
};

function ts(iso: string | null | undefined) {
  if (!iso) return '-';
  try { return format(new Date(iso), 'MM/dd HH:mm:ss', { locale: ko }); } catch { return iso; }
}

export const AdminCheerMonitorPage = () => {
  const [challengeId, setChallengeId] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>(['pending', 'sent', 'receiver_completed']);
  const [inputValue, setInputValue] = useState('');

  const queryParams = new URLSearchParams();
  if (challengeId) queryParams.set('challengeId', challengeId);
  if (statusFilter.length < 3) queryParams.set('status', statusFilter.join(','));
  queryParams.set('limit', '100');

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-cheer-monitor', challengeId, statusFilter.join(',')],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/cheer/monitor?${queryParams.toString()}`);
      return res.data.data;
    },
    refetchInterval: 30_000,
  });

  const summary = data?.summary || { total: 0, byStatus: {} };
  const pending: any[] = data?.pending || [];
  const sent: any[] = data?.sent || [];
  const receiverCompleted: any[] = data?.receiverCompleted || [];
  const userScores: any[] = data?.userScores || [];

  const toggleStatus = (s: string) =>
    setStatusFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📣 응원 모니터</h1>
          <p className="text-sm text-gray-500 mt-1">유저별 응원·감사 점수 및 알람 발송 현황을 확인합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-50"
        >
          {isFetching ? '불러오는 중...' : '새로고침'}
        </button>
      </div>

      {/* 필터 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">필터</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">챌린지 ID</label>
            <div className="flex gap-2">
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setChallengeId(inputValue.trim())}
                placeholder="challengeId (Enter로 적용)"
                className="border rounded-lg px-3 py-1.5 text-sm w-72"
              />
              <button
                type="button"
                onClick={() => setChallengeId(inputValue.trim())}
                className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm"
              >적용</button>
              {challengeId && (
                <button
                  type="button"
                  onClick={() => { setChallengeId(''); setInputValue(''); }}
                  className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm"
                >초기화</button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">상태 필터</label>
            <div className="flex gap-2">
              {(['pending', 'sent', 'receiver_completed'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    statusFilter.includes(s)
                      ? STATUS_BADGE[s] + ' border-current'
                      : 'bg-white text-gray-400 border-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        {challengeId && (
          <p className="text-xs text-blue-600">챌린지 ID: <span className="font-mono">{challengeId}</span></p>
        )}
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          데이터를 불러오지 못했습니다.
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-400 text-sm">불러오는 중...</div>
      ) : (
        <>
          {/* 집계 요약 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: '전체 응원', value: summary.total, color: 'text-gray-900' },
              { label: '예약 대기 (pending)', value: summary.byStatus.pending ?? 0, color: 'text-amber-600' },
              { label: '발송 완료 (sent)', value: summary.byStatus.sent ?? 0, color: 'text-green-600' },
              { label: '수신자 먼저 완료', value: summary.byStatus.receiver_completed ?? 0, color: 'text-purple-600' },
            ].map((card) => (
              <div key={card.label} className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* 유저별 점수 (챌린지 지정 시) */}
          {userScores.length > 0 && (
            <section>
              <h2 className="text-base font-bold text-gray-900 mb-3">🏆 유저별 점수</h2>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">userId</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">현재 Day</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">연속일</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 text-green-600">인증 점수</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-amber-600">감사 점수</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {userScores
                      .sort((a, b) => (b.thankScore - a.thankScore) || (b.score - a.score))
                      .map((u) => (
                        <tr key={u.userChallengeId} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{u.userId}</td>
                          <td className="px-4 py-3 text-center text-gray-700">Day {u.currentDay}</td>
                          <td className="px-4 py-3 text-center text-gray-700">{u.consecutiveDays}일</td>
                          <td className="px-4 py-3 text-center font-bold text-green-700">{u.score}</td>
                          <td className="px-4 py-3 text-center font-bold text-amber-600">{u.thankScore}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>{u.status}</span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 예약 대기 응원 */}
          {statusFilter.includes('pending') && (
            <section>
              <h2 className="text-base font-bold text-gray-900 mb-3">
                🔔 응원 예약 대기
                <span className="ml-2 text-sm font-normal text-amber-600">{pending.length}건</span>
              </h2>
              {pending.length === 0 ? (
                <p className="text-sm text-gray-400">예약 대기 중인 응원이 없어요</p>
              ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">발신자 (alias)</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">수신자 ID</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">delta(분)</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Day</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-amber-600">발송 예정 시각</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">생성 시각</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pending.map((c) => (
                        <tr key={c.cheerId} className="hover:bg-amber-50">
                          <td className="px-4 py-3">
                            <span className="font-semibold text-gray-700">{c.senderAlias || '-'}</span>
                            <span className="ml-2 font-mono text-[10px] text-gray-400">{c.senderId}</span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.receiverId}</td>
                          <td className="px-4 py-3 text-center text-gray-700">{c.senderDelta ?? '-'}</td>
                          <td className="px-4 py-3 text-center text-gray-700">{c.day ?? '-'}</td>
                          <td className="px-4 py-3 text-center font-semibold text-amber-600">{ts(c.scheduledTime)}</td>
                          <td className="px-4 py-3 text-center text-gray-400 text-xs">{ts(c.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* 발송 완료 응원 */}
          {statusFilter.includes('sent') && (
            <section>
              <h2 className="text-base font-bold text-gray-900 mb-3">
                ✅ 발송 완료
                <span className="ml-2 text-sm font-normal text-green-600">{sent.length}건</span>
              </h2>
              {sent.length === 0 ? (
                <p className="text-sm text-gray-400">발송 완료된 응원이 없어요</p>
              ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">발신자 (alias)</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">수신자 ID</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">delta(분)</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Day</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-green-600">발송 시각</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-amber-600">감사 점수</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">리액션</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sent.map((c) => (
                        <tr key={c.cheerId} className="hover:bg-green-50">
                          <td className="px-4 py-3">
                            <span className="font-semibold text-gray-700">{c.senderAlias || '-'}</span>
                            <span className="ml-2 font-mono text-[10px] text-gray-400">{c.senderId}</span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.receiverId}</td>
                          <td className="px-4 py-3 text-center text-gray-700">{c.senderDelta ?? '-'}</td>
                          <td className="px-4 py-3 text-center text-gray-700">{c.day ?? '-'}</td>
                          <td className="px-4 py-3 text-center font-semibold text-green-700">{ts(c.sentAt)}</td>
                          <td className="px-4 py-3 text-center">
                            {c.isThankScoreGranted
                              ? <span className="text-amber-600 font-semibold">✨ 적립</span>
                              : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-4 py-3 text-center">{c.reactionType || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* 수신자 먼저 완료 */}
          {statusFilter.includes('receiver_completed') && (
            <section>
              <h2 className="text-base font-bold text-gray-900 mb-3">
                🎯 수신자 먼저 완료 (감사 점수 자동 적립)
                <span className="ml-2 text-sm font-normal text-purple-600">{receiverCompleted.length}건</span>
              </h2>
              {receiverCompleted.length === 0 ? (
                <p className="text-sm text-gray-400">해당 케이스가 없어요</p>
              ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">발신자 (alias)</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">수신자 ID</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">delta(분)</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Day</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-purple-600">감사 점수 적립 시각</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {receiverCompleted.map((c) => (
                        <tr key={c.cheerId} className="hover:bg-purple-50">
                          <td className="px-4 py-3">
                            <span className="font-semibold text-gray-700">{c.senderAlias || '-'}</span>
                            <span className="ml-2 font-mono text-[10px] text-gray-400">{c.senderId}</span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.receiverId}</td>
                          <td className="px-4 py-3 text-center text-gray-700">{c.senderDelta ?? '-'}</td>
                          <td className="px-4 py-3 text-center text-gray-700">{c.day ?? '-'}</td>
                          <td className="px-4 py-3 text-center font-semibold text-purple-700">{ts(c.thankScoreGrantedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};
