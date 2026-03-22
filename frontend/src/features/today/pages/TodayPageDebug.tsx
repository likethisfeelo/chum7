/**
 * TodayPageDebug — 응원 시스템 동작 확인용 화면 (개발/QA 전용)
 * 라우트: /today/debug
 * 목적: receiver_completed·isThankScoreGranted 등 raw 값을 그대로 노출해
 *       새 응원 점수 시스템이 올바르게 동작하는지 육안으로 검증
 */
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { Loading } from '@/shared/components/Loading';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const STATUS_COLOR: Record<string, string> = {
  sent: 'bg-green-100 text-green-700',
  receiver_completed: 'bg-purple-100 text-purple-700',
  pending: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
};

export const TodayPageDebug = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: cheers, isLoading: cheersLoading } = useQuery({
    queryKey: ['my-cheers', 'received'],
    queryFn: async () => {
      const res = await apiClient.get('/cheer/my-cheers?type=received&limit=20');
      return res.data.data.cheers;
    },
  });

  const { data: sentCheers, isLoading: sentCheersLoading } = useQuery({
    queryKey: ['my-cheers', 'sent'],
    queryFn: async () => {
      const res = await apiClient.get('/cheer/my-cheers?type=sent&limit=20');
      return res.data.data.cheers;
    },
  });

  const { data: myChallengesData } = useQuery({
    queryKey: ['my-challenges-today'],
    queryFn: async () => {
      const res = await apiClient.get('/challenges/my?status=active');
      return res.data.data;
    },
  });

  const activeChallenges = useMemo(() => myChallengesData?.challenges || [], [myChallengesData]);
  const sentAll = useMemo(() => sentCheers || [], [sentCheers]);
  const receivedAll = useMemo(() => cheers || [], [cheers]);

  const stats = useMemo(() => ({
    sentTotal: sentAll.length,
    sentSent: sentAll.filter((c: any) => c.status === 'sent').length,
    sentReceiverCompleted: sentAll.filter((c: any) => c.status === 'receiver_completed').length,
    sentPending: sentAll.filter((c: any) => c.status === 'pending').length,
    receivedTotal: receivedAll.length,
    receivedSent: receivedAll.filter((c: any) => c.status === 'sent').length,
    receivedPending: receivedAll.filter((c: any) => c.status === 'pending').length,
    totalCheerScore: activeChallenges.reduce((s: number, c: any) => s + (c.cheerScore || 0), 0),
    totalThankScore: activeChallenges.reduce((s: number, c: any) => s + (c.thankScore || 0), 0),
  }), [sentAll, receivedAll, activeChallenges]);

  const today = format(new Date(), 'yyyy.MM.dd (E)', { locale: ko });

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-4 py-3 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold font-mono text-yellow-400">[DEBUG] 오늘 탭</h1>
          <p className="text-xs text-gray-400 font-mono">{today}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => queryClient.invalidateQueries()}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 border border-gray-600 rounded"
          >
            새로고침
          </button>
          <button
            onClick={() => navigate('/today')}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 border border-gray-600 rounded"
          >
            ← 일반 보기
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* 응원 시스템 통계 패널 */}
        <section className="bg-gray-800 border border-yellow-500/30 rounded-xl p-4 font-mono">
          <h2 className="text-yellow-400 text-sm font-bold mb-3">📊 응원 시스템 현황</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-700 rounded-lg p-2">
              <p className="text-gray-400">🎟 cheerScore (합산)</p>
              <p className="text-orange-300 text-lg font-bold">{stats.totalCheerScore}</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-2">
              <p className="text-gray-400">✨ thankScore (합산)</p>
              <p className="text-yellow-300 text-lg font-bold">{stats.totalThankScore}</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-2">
              <p className="text-gray-400">receiver_completed</p>
              <p className="text-purple-300 text-lg font-bold">{stats.sentReceiverCompleted}</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-2">
              <p className="text-gray-400">보낸 응원 (sent)</p>
              <p className="text-green-300 text-lg font-bold">{stats.sentSent}</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-2">
              <p className="text-gray-400">보낸 응원 (pending)</p>
              <p className="text-amber-300 text-lg font-bold">{stats.sentPending}</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-2">
              <p className="text-gray-400">받은 응원 (sent)</p>
              <p className="text-blue-300 text-lg font-bold">{stats.receivedSent}</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-2">
              <p className="text-gray-400">받은 응원 (pending)</p>
              <p className="text-amber-300 text-lg font-bold">{stats.receivedPending}</p>
            </div>
          </div>
        </section>

        {/* 챌린지별 점수 */}
        {activeChallenges.length > 0 && (
          <section className="bg-gray-800 border border-gray-700 rounded-xl p-4 font-mono">
            <h2 className="text-sm font-bold text-gray-300 mb-3">챌린지별 점수</h2>
            <div className="space-y-2">
              {activeChallenges.map((c: any) => (
                <div key={c.userChallengeId} className="bg-gray-700 rounded-lg p-3 text-xs">
                  <p className="text-white font-semibold">{c.challenge?.title}</p>
                  <p className="text-gray-400 mt-1">
                    score={c.score ?? 0} · <span className="text-orange-300">cheerScore={c.cheerScore ?? 0}</span> · <span className="text-yellow-300">thankScore={c.thankScore ?? 0}</span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 보낸 응원 전체 (raw) */}
        <section className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <h2 className="text-sm font-bold text-gray-300 mb-3 font-mono">보낸 응원 (sent cheers)</h2>
          {sentCheersLoading ? (
            <Loading />
          ) : sentAll.length === 0 ? (
            <p className="text-xs text-gray-500 font-mono">없음</p>
          ) : (
            <div className="space-y-2">
              {sentAll.map((cheer: any) => (
                <div key={cheer.cheerId} className="bg-gray-700 rounded-lg p-3 font-mono text-xs space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-gray-300 text-[10px] break-all">id: {cheer.cheerId}</p>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${STATUS_COLOR[cheer.status] || 'bg-gray-600 text-gray-300'}`}>
                      {cheer.status}
                    </span>
                  </div>
                  <p className="text-gray-400">delta: {cheer.delta ?? 'null'} · day: {cheer.day ?? 'null'}</p>
                  <p className="text-gray-400">
                    isThankScoreGranted: <span className={cheer.isThankScoreGranted ? 'text-yellow-300' : 'text-gray-500'}>{String(cheer.isThankScoreGranted)}</span>
                  </p>
                  {cheer.thankScoreGrantedAt && (
                    <p className="text-purple-300">thankScoreGrantedAt: {format(new Date(cheer.thankScoreGrantedAt), 'HH:mm:ss', { locale: ko })}</p>
                  )}
                  <p className="text-gray-500">scheduledTime: {cheer.scheduledTime ? format(new Date(cheer.scheduledTime), 'HH:mm', { locale: ko }) : 'null'}</p>
                  <p className="text-gray-500">sentAt: {cheer.sentAt ? format(new Date(cheer.sentAt), 'HH:mm', { locale: ko }) : 'null'}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 받은 응원 전체 (raw) */}
        <section className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <h2 className="text-sm font-bold text-gray-300 mb-3 font-mono">받은 응원 (received cheers)</h2>
          {cheersLoading ? (
            <Loading />
          ) : receivedAll.length === 0 ? (
            <p className="text-xs text-gray-500 font-mono">없음</p>
          ) : (
            <div className="space-y-2">
              {receivedAll.map((cheer: any) => (
                <div key={cheer.cheerId} className="bg-gray-700 rounded-lg p-3 font-mono text-xs space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-gray-300 text-[10px] break-all">id: {cheer.cheerId}</p>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${STATUS_COLOR[cheer.status] || 'bg-gray-600 text-gray-300'}`}>
                      {cheer.status}
                    </span>
                  </div>
                  <p className="text-gray-400">senderAlias: {cheer.senderAlias} · delta: {cheer.delta ?? 'null'}</p>
                  <p className="text-gray-400">
                    isRead: <span className={cheer.isRead ? 'text-green-300' : 'text-red-400'}>{String(cheer.isRead)}</span>
                    {' · '}isThanked: <span className={cheer.isThanked ? 'text-yellow-300' : 'text-gray-500'}>{String(cheer.isThanked)}</span>
                  </p>
                  <p className="text-gray-500">scheduledTime: {cheer.scheduledTime ? format(new Date(cheer.scheduledTime), 'HH:mm', { locale: ko }) : 'null'}</p>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
};
