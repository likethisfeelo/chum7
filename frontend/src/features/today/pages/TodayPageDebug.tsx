/**
 * TodayPageDebug — 응원 시스템 동작 확인용 화면 (개발/QA 전용)
 * 라우트: /today/debug
 * 목적: receiver_completed·isThankScoreGranted 등 raw 값을 그대로 노출해
 *       새 응원 점수 시스템이 올바르게 동작하는지 육안으로 검증
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { Loading } from '@/shared/components/Loading';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import {
  getChallengeDisplayMeta,
  isVerificationDayCompleted,
} from '@/features/challenge/utils/challengeLifecycle';

function getTodayVerificationId(progress: any[], day: number): string | null {
  const entry = (progress || []).find((p: any) => Number(p?.day) === day);
  return entry?.verificationId ?? null;
}

const STATUS_COLOR: Record<string, string> = {
  sent: 'bg-green-100 text-green-700',
  receiver_completed: 'bg-purple-100 text-purple-700',
  pending: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
};

export const TodayPageDebug = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const { data: myChallengesData, isLoading: challengesLoading } = useQuery({
    queryKey: ['my-challenges-today'],
    queryFn: async () => {
      const res = await apiClient.get('/challenges/my?status=active');
      return res.data.data;
    },
  });

  const deleteVerificationMutation = useMutation({
    mutationFn: async (verificationId: string) => {
      await apiClient.delete(`/verifications/${verificationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-challenges-today'] });
      setDeletingId(null);
      toast.success('[DEBUG] 인증 삭제 완료');
    },
    onError: (e: any) => toast.error(`[DEBUG] 삭제 실패: ${e?.message}`),
  });

  const activeChallenges = useMemo(() => myChallengesData?.challenges || [], [myChallengesData]);

  // 통계
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
    totalThankScore: activeChallenges.reduce((s: number, c: any) => s + (c.thankScore || 0), 0),
  }), [sentAll, receivedAll, activeChallenges]);

  const today = format(new Date(), 'yyyy.MM.dd (E)', { locale: ko });

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* 헤더 */}
      <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-4 py-3 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold font-mono text-yellow-400">[DEBUG] 오늘 탭</h1>
          <p className="text-xs text-gray-400 font-mono">{today}</p>
        </div>
        <button
          onClick={() => navigate('/today')}
          className="text-xs text-gray-400 hover:text-white px-2 py-1 border border-gray-600 rounded"
        >
          ← 일반 보기
        </button>
      </div>

      <div className="p-4 space-y-4">

        {/* ─── 응원 시스템 통계 패널 ─── */}
        <section className="bg-gray-800 border border-yellow-500/30 rounded-xl p-4 font-mono">
          <h2 className="text-yellow-400 text-sm font-bold mb-3">📊 응원 시스템 현황</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-700 rounded-lg p-2">
              <p className="text-gray-400">thankScore (합산)</p>
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

        {/* ─── 오늘의 인증 + 삭제 ─── */}
        <section className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <h2 className="text-sm font-bold text-gray-300 mb-3 font-mono">오늘의 인증 [삭제 가능]</h2>
          {challengesLoading ? (
            <Loading />
          ) : activeChallenges.length === 0 ? (
            <p className="text-xs text-gray-500 font-mono">진행 중인 챌린지 없음</p>
          ) : (
            <div className="space-y-2">
              {activeChallenges.map((challenge: any) => {
                const progress = challenge.progress || [];
                const { currentDay, durationDays, isChallengeCompleted } = getChallengeDisplayMeta(challenge);
                const todayDone = isChallengeCompleted || isVerificationDayCompleted(progress, currentDay);
                const todayVerificationId = getTodayVerificationId(progress, currentDay);

                return (
                  <div key={challenge.userChallengeId} className="bg-gray-700 rounded-lg p-3 font-mono text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-white font-semibold">{challenge.challenge?.title}</p>
                        <p className="text-gray-400">Day {currentDay}/{durationDays} · score={challenge.score ?? 0} · thankScore={challenge.thankScore ?? 0}</p>
                        <p className="text-gray-500 text-[10px] mt-0.5">verificationId: {todayVerificationId || 'null'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${todayDone ? 'bg-green-800 text-green-200' : 'bg-amber-800 text-amber-200'}`}>
                          {todayDone ? 'complete' : 'pending'}
                        </span>
                        {todayDone && todayVerificationId && !isChallengeCompleted && (
                          deletingId === todayVerificationId ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => deleteVerificationMutation.mutate(todayVerificationId)}
                                disabled={deleteVerificationMutation.isPending}
                                className="px-2 py-0.5 bg-red-600 text-white rounded text-[10px]"
                              >
                                확인
                              </button>
                              <button
                                onClick={() => setDeletingId(null)}
                                className="px-2 py-0.5 bg-gray-600 text-gray-200 rounded text-[10px]"
                              >
                                취소
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeletingId(todayVerificationId)}
                              className="px-2 py-0.5 bg-red-900/50 text-red-300 border border-red-700 rounded text-[10px]"
                            >
                              🗑️ 삭제
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ─── 보낸 응원 전체 (raw) ─── */}
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

        {/* ─── 받은 응원 전체 (raw) ─── */}
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
