import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import {
  getChallengeDisplayMeta,
  isVerificationDayCompleted,
} from '@/features/challenge/utils/challengeLifecycle';

type StatsPeriod = 'day' | 'week' | 'month';

const PERIOD_LABEL: Record<StatsPeriod, string> = {
  day: '오늘',
  week: '이번 주',
  month: '이번 달',
};

function toWeekInputValue(date: Date): string {
  const year = date.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const weekNum = Math.ceil(((date.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

const REACTION_OPTIONS = ['❤️', '🔥', '👏'] as const;

export const TodayPage = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [replyDraftByCheer, setReplyDraftByCheer] = useState<Record<string, string>>({});
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('day');
  const [statsDateValue, setStatsDateValue] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [statsWeekValue, setStatsWeekValue] = useState(toWeekInputValue(new Date()));
  const [statsMonthValue, setStatsMonthValue] = useState(format(new Date(), 'yyyy-MM'));

  const { data: cheers, isLoading: cheersLoading } = useQuery({
    queryKey: ['my-cheers', 'received'],
    queryFn: async () => {
      const response = await apiClient.get('/cheer/my-cheers?type=received&limit=20');
      return response.data.data.cheers;
    },
  });

  const { data: sentCheers, isLoading: sentCheersLoading } = useQuery({
    queryKey: ['my-cheers', 'sent'],
    queryFn: async () => {
      const response = await apiClient.get('/cheer/my-cheers?type=sent&limit=20');
      return response.data.data.cheers;
    },
  });

  const { data: myChallengesData, isLoading: challengesLoading } = useQuery({
    queryKey: ['my-challenges-today'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=active');
      return response.data.data;
    },
  });

  const reactionMutation = useMutation({
    mutationFn: async ({ cheerId, reactionType }: { cheerId: string; reactionType: string }) => {
      const response = await apiClient.post(`/cheers/${cheerId}/reaction`, { reactionType });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-cheers'] });
      toast.success('리액션을 보냈어요');
    },
    onError: () => {
      toast.error('리액션 전송 중 오류가 발생했습니다');
    }
  });

  const replyMutation = useMutation({
    mutationFn: async ({ cheerId, message }: { cheerId: string; message: string }) => {
      const response = await apiClient.post(`/cheers/${cheerId}/reply`, { message });
      return response.data;
    },
    onSuccess: (_, variables) => {
      setReplyDraftByCheer((prev) => ({ ...prev, [variables.cheerId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['my-cheers'] });
      toast.success('답장을 보냈어요');
    },
    onError: () => {
      toast.error('답장 전송 중 오류가 발생했습니다');
    }
  });

  const today = format(new Date(), 'yyyy.MM.dd (E)', { locale: ko });

  // 받은 응원 분리: 이미 도착한 것 / 예약 대기 중
  const deliveredReceived = useMemo(() => (cheers || []).filter((c: any) => c.status !== 'pending'), [cheers]);
  const pendingReceived = useMemo(() => (cheers || []).filter((c: any) => c.status === 'pending'), [cheers]);
  const unreadCheers = deliveredReceived.filter((c: any) => !c.isRead);

  // 보낸 응원 분리: 이미 발송된 것 / 예약 대기 중
  const deliveredSent = useMemo(() => (sentCheers || []).filter((c: any) => c.status !== 'pending'), [sentCheers]);
  const pendingSent = useMemo(() => (sentCheers || []).filter((c: any) => c.status === 'pending'), [sentCheers]);

  // 보낸 감사: 내가 감사를 보낸 응원 (received & isThanked=true)
  const thanksSent = useMemo(() => (cheers || []).filter((c: any) => c.isThanked === true), [cheers]);

  // 백엔드가 이미 ?status=active 로 필터했으므로 추가 필터 불필요.
  // resolveChallengeBucket 이중 필터 시 lifecycle='recruiting' 챌린지가 누락되는 버그 수정.
  const activeChallenges = useMemo(
    () => myChallengesData?.challenges || [],
    [myChallengesData]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">오늘 📊</h1>
            <p className="text-sm text-gray-500">📅 {today}</p>
          </div>
          <button
            onClick={() => navigate('/admin/docs')}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded"
          >
            운영 Docs
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* 오늘의 인증 현황 */}
        <section className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
          <h2 className="text-base font-bold text-gray-900">오늘의 인증</h2>
          {challengesLoading ? (
            <Loading />
          ) : activeChallenges.length === 0 ? (
            <p className="text-sm text-gray-500">진행 중인 챌린지가 없어요</p>
          ) : (
            <div className="space-y-2">
              {activeChallenges.map((challenge: any) => {
                const progress = challenge.progress || [];
                const { currentDay, durationDays, isChallengeCompleted, participatedDays, completionRate } = getChallengeDisplayMeta(challenge);
                const todayDone = isChallengeCompleted || isVerificationDayCompleted(progress, currentDay);
                return (
                  <div key={challenge.userChallengeId} className="flex items-center justify-between gap-3 py-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{challenge.challenge?.badgeIcon || '🎯'}</span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{challenge.challenge?.title}</p>
                        {isChallengeCompleted ? (
                          <p className="text-xs text-emerald-600">🏁 챌린지 완료</p>
                        ) : (
                          <>
                            <p className="text-xs text-gray-500">Day {currentDay} / {durationDays}</p>
                            <p className="text-[11px] text-gray-400">참여 {participatedDays}일 · 진행률 {completionRate}%</p>
                          </>
                        )}
                      </div>
                    </div>
                    {todayDone ? (
                      <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">✅ 완료</span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">⏳ 대기</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 받은 응원 — 이미 도착한 것만 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">💌 받은 응원</h2>
            {unreadCheers.length > 0 && (
              <span className="px-2 py-0.5 bg-primary-100 text-primary-600 text-xs font-bold rounded-full">
                {unreadCheers.length} NEW
              </span>
            )}
          </div>
          {cheersLoading ? (
            <Loading />
          ) : deliveredReceived.length === 0 ? (
            <EmptyState
              icon="💌"
              title="아직 받은 응원이 없어요"
              description="인증을 올리면 다른 챌린저들이 응원을 보내줄 거예요"
            />
          ) : (
            <div className="space-y-3">
              {deliveredReceived.map((cheer: any, index: number) => {
                const senderName = cheer.senderAlias || '익명의 응원자';
                const displayMessage = cheer.message
                  || (cheer.delta ? `${cheer.delta}분 일찍 인증하고 응원을 보냈어요 💪` : '응원을 보냈어요 💪');
                return (
                  <motion.div
                    key={cheer.cheerId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`bg-white rounded-2xl p-5 shadow-sm border ${!cheer.isRead ? 'border-primary-200' : 'border-gray-100'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-xl flex-shrink-0">
                          💖
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 mb-1">{senderName}</p>
                          <p className="text-gray-700 text-sm leading-relaxed">{displayMessage}</p>
                          <p className="text-xs text-gray-400 mt-2">
                            {format(new Date(cheer.sentAt || cheer.createdAt), 'MM/dd HH:mm', { locale: ko })}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {cheer.reactionType ? (
                              <span className="px-2 py-1 text-xs rounded-lg bg-emerald-50 text-emerald-700">리액션 {cheer.reactionType}</span>
                            ) : REACTION_OPTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => reactionMutation.mutate({ cheerId: cheer.cheerId, reactionType: emoji })}
                                className="px-2 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200"
                                disabled={reactionMutation.isPending}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                          <div className="mt-2">
                            {cheer.replyMessage ? (
                              <div className="space-y-1">
                                <p className="text-xs text-indigo-700 bg-indigo-50 rounded-xl p-2">답장: {cheer.replyMessage}</p>
                                <p className="text-[11px] text-gray-500">답장은 1회 작성 정책으로 수정/삭제할 수 없어요.</p>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-[11px] text-gray-500 mb-1">답장은 1회 작성 정책이며 전송 후 수정/삭제할 수 없어요.</p>
                                <div className="flex gap-2">
                                  <input
                                    value={replyDraftByCheer[cheer.cheerId] ?? ''}
                                    onChange={(e) => setReplyDraftByCheer((prev) => ({ ...prev, [cheer.cheerId]: e.target.value }))}
                                    placeholder="응원에 답장 남기기"
                                    className="flex-1 border rounded-xl px-3 py-2 text-xs"
                                  />
                                  <button
                                    onClick={() => replyMutation.mutate({ cheerId: cheer.cheerId, message: (replyDraftByCheer[cheer.cheerId] ?? '').trim() })}
                                    className="px-3 py-2 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-xl"
                                    disabled={replyMutation.isPending || !(replyDraftByCheer[cheer.cheerId] ?? '').trim()}
                                  >
                                    답장
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {cheer.isThanked ? (
                        <span className="flex-shrink-0 px-3 py-2 bg-rose-50 text-rose-400 text-xs rounded-xl">감사 완료 💝</span>
                      ) : (
                        <span className="flex-shrink-0 px-3 py-2 bg-gray-50 text-gray-400 text-xs rounded-xl">감사 대기</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* 응원 통계 기간 필터 */}
        <section className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
          <h2 className="text-base font-bold text-gray-900">응원 통계</h2>
          <div className="flex gap-2">
            {(['day', 'week', 'month'] as StatsPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setStatsPeriod(p)}
                className={`px-3 py-1 text-xs rounded-full border ${statsPeriod === p ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          {statsPeriod === 'day' && (
            <input
              type="date"
              value={statsDateValue}
              onChange={(e) => setStatsDateValue(e.target.value)}
              className="border rounded-xl px-3 py-1.5 text-xs"
            />
          )}
          {statsPeriod === 'week' && (
            <input
              type="week"
              value={statsWeekValue}
              onChange={(e) => setStatsWeekValue(e.target.value)}
              className="border rounded-xl px-3 py-1.5 text-xs"
            />
          )}
          {statsPeriod === 'month' && (
            <input
              type="month"
              value={statsMonthValue}
              onChange={(e) => setStatsMonthValue(e.target.value)}
              className="border rounded-xl px-3 py-1.5 text-xs"
            />
          )}
        </section>

        {/* 내가 보낸 응원 ✉️ — 이미 발송된 것만 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">내가 보낸 응원 ✉️</h2>
          </div>
          {sentCheersLoading ? (
            <Loading />
          ) : deliveredSent.length === 0 ? (
            <EmptyState icon="📭" title="아직 보낸 응원이 없어요" description="목표 시간보다 일찍 인증하면 자동 응원이 발송돼요" />
          ) : (
            <div className="space-y-3">
              {deliveredSent.map((cheer: any) => {
                const displayMessage = cheer.message
                  || (cheer.delta ? `${cheer.delta}분 일찍 인증해서 보낸 자동 응원` : '자동 응원');
                return (
                  <div key={cheer.cheerId} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-700 flex-1">{displayMessage}</p>
                      {cheer.isThanked ? (
                        <span className="flex-shrink-0 px-2 py-1 text-xs font-semibold bg-rose-50 text-rose-500 rounded-lg">감사받음 ❤️</span>
                      ) : (
                        <span className="flex-shrink-0 px-2 py-1 text-xs bg-gray-100 text-gray-500 rounded-lg">감사 대기</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(cheer.sentAt || cheer.createdAt), 'MM/dd HH:mm', { locale: ko })}
                    </p>
                    {cheer.isThanked && cheer.thankedAt && (
                      <p className="text-xs text-rose-400 mt-0.5">
                        {format(new Date(cheer.thankedAt), 'MM/dd HH:mm', { locale: ko })} 인증 완료로 감사 수신
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {cheer.replyMessage ? (
                        <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700">답장 도착</span>
                      ) : (
                        <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600">답장 대기</span>
                      )}
                      {cheer.reactionType ? (
                        <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">리액션 {cheer.reactionType}</span>
                      ) : (
                        <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600">리액션 대기</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 보낸 감사 — 내가 감사 버튼을 눌러 감사를 보낸 내역 */}
        {thanksSent.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900">💝 보낸 감사</h2>
              <span className="text-xs text-gray-400">{thanksSent.length}건</span>
            </div>
            <div className="space-y-2">
              {thanksSent.map((cheer: any) => {
                const senderName = cheer.senderAlias || '익명의 응원자';
                const displayMessage = cheer.message
                  || (cheer.delta ? `${cheer.delta}분 일찍 인증하고 응원을 보냈어요 💪` : '응원을 보냈어요 💪');
                return (
                  <div key={cheer.cheerId} className="bg-rose-50 rounded-xl p-3 border border-rose-100 flex items-center gap-3">
                    <span className="text-lg flex-shrink-0">💝</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-rose-700">{senderName}의 응원에 감사를 보냈어요</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{displayMessage}</p>
                      {cheer.thankMessage && (
                        <p className="text-xs text-rose-600 mt-1">💬 {cheer.thankMessage}</p>
                      )}
                    </div>
                    {cheer.thankedAt && (
                      <p className="text-[11px] text-gray-400 flex-shrink-0">
                        {format(new Date(cheer.thankedAt), 'HH:mm', { locale: ko })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 알람 예정 응원 — 응원 자체는 도착, 알람만 예정 */}
        {(pendingReceived.length > 0 || pendingSent.length > 0) && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900">🔔 알람 예정</h2>
              <span className="text-xs text-gray-400">{pendingReceived.length + pendingSent.length}건</span>
            </div>
            <div className="space-y-2">
              {pendingReceived.map((cheer: any) => {
                const senderName = cheer.senderAlias || '익명의 응원자';
                const displayMessage = cheer.message
                  || (cheer.delta ? `${cheer.delta}분 일찍 인증하고 응원을 보냈어요 💪` : '응원을 보냈어요 💪');
                return (
                  <div key={cheer.cheerId} className="bg-amber-50 rounded-xl p-3 border border-amber-100 flex items-center gap-3">
                    <span className="text-lg flex-shrink-0">📨</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">알람 예정</span>
                        <p className="text-xs font-medium text-gray-700 truncate">{senderName}</p>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{displayMessage}</p>
                    </div>
                    {cheer.scheduledTime && (
                      <p className="text-[11px] text-amber-600 flex-shrink-0 font-medium">
                        {format(new Date(cheer.scheduledTime), 'HH:mm', { locale: ko })}
                      </p>
                    )}
                  </div>
                );
              })}
              {pendingSent.map((cheer: any) => {
                const displayMessage = cheer.message
                  || (cheer.delta ? `${cheer.delta}분 일찍 인증해서 보낸 자동 응원` : '자동 응원');
                return (
                  <div key={cheer.cheerId} className="bg-amber-50 rounded-xl p-3 border border-amber-100 flex items-center gap-3">
                    <span className="text-lg flex-shrink-0">📤</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-semibold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">알람 예정</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{displayMessage}</p>
                    </div>
                    {cheer.scheduledTime && (
                      <p className="text-[11px] text-orange-600 flex-shrink-0 font-medium">
                        {format(new Date(cheer.scheduledTime), 'HH:mm', { locale: ko })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
