import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

const REACTION_OPTIONS = ['❤️', '🔥', '👏'] as const;

export const TodayPage = () => {
  const queryClient = useQueryClient();
  const [replyDraftByCheer, setReplyDraftByCheer] = useState<Record<string, string>>({});

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

  const thankMutation = useMutation({
    mutationFn: async (cheerId: string) => {
      const response = await apiClient.post(`/cheers/${cheerId}/thank`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-cheers'] });
      toast.success('감사 표현을 보냈어요 💖');
    },
    onError: () => {
      toast.error('이미 감사 표현을 했거나 오류가 발생했습니다');
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
  const unreadCheers = cheers?.filter((c: any) => !c.isRead) || [];

  // 백엔드가 이미 ?status=active 로 필터했으므로 추가 필터 불필요.
  // resolveChallengeBucket 이중 필터 시 lifecycle='recruiting' 챌린지가 누락되는 버그 수정.
  const activeChallenges = useMemo(
    () => myChallengesData?.challenges || [],
    [myChallengesData]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
        <h1 className="text-2xl font-bold text-gray-900">오늘 📊</h1>
        <p className="text-sm text-gray-500">📅 {today}</p>
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

        {/* 받은 응원 */}
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
          ) : !cheers || cheers.length === 0 ? (
            <EmptyState
              icon="💌"
              title="아직 받은 응원이 없어요"
              description="인증을 올리면 다른 챌린저들이 응원을 보내줄 거예요"
            />
          ) : (
            <div className="space-y-3">
              {cheers.map((cheer: any, index: number) => {
                const isPending = cheer.status === 'pending';
                const senderName = cheer.senderAlias || '익명의 응원자';
                const displayMessage = cheer.message
                  || (cheer.delta ? `${cheer.delta}분 일찍 인증하고 응원을 보냈어요 💪` : '응원을 보냈어요 💪');
                return (
                  <motion.div
                    key={cheer.cheerId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`bg-white rounded-2xl p-5 shadow-sm border ${isPending ? 'border-amber-200 opacity-80' : !cheer.isRead ? 'border-primary-200' : 'border-gray-100'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-xl flex-shrink-0">
                          💖
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-900">{senderName}</p>
                            {isPending ? (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-600 rounded-md">예약됨</span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-600 rounded-md">도착</span>
                            )}
                          </div>
                          <p className="text-gray-700 text-sm leading-relaxed">{displayMessage}</p>
                          <p className="text-xs text-gray-400 mt-2">
                            {isPending && cheer.scheduledTime
                              ? `${format(new Date(cheer.scheduledTime), 'MM/dd HH:mm', { locale: ko })} 도착 예정`
                              : format(new Date(cheer.sentAt || cheer.createdAt), 'MM/dd HH:mm', { locale: ko })}
                          </p>

                          {!isPending && (
                            <>
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
                            </>
                          )}
                        </div>
                      </div>
                      {!isPending && (
                        !cheer.isThanked ? (
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => thankMutation.mutate(cheer.cheerId)}
                            disabled={thankMutation.isPending}
                            className="flex-shrink-0 px-3 py-2 bg-primary-50 text-primary-600 text-xs font-semibold rounded-xl hover:bg-primary-100 transition-colors disabled:opacity-50"
                          >
                            감사 💝
                          </motion.button>
                        ) : (
                          <span className="flex-shrink-0 px-3 py-2 bg-gray-50 text-gray-400 text-xs rounded-xl">감사 완료</span>
                        )
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* 보낸 응원 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">📤 내가 보낸 응원</h2>
          </div>
          {sentCheersLoading ? (
            <Loading />
          ) : !sentCheers || sentCheers.length === 0 ? (
            <EmptyState icon="📭" title="아직 보낸 응원이 없어요" description="목표 시간보다 일찍 인증하면 자동 응원이 발송돼요" />
          ) : (
            <div className="space-y-3">
              {sentCheers.map((cheer: any) => {
                const isPending = cheer.status === 'pending';
                const displayMessage = cheer.message
                  || (cheer.delta ? `${cheer.delta}분 일찍 인증해서 보낸 자동 응원` : '자동 응원');
                return (
                  <div key={cheer.cheerId} className={`bg-white rounded-2xl p-4 shadow-sm border ${isPending ? 'border-amber-100' : 'border-gray-100'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-700 flex-1">{displayMessage}</p>
                      {/* 감사 수신 여부 — 핵심 기록 */}
                      {cheer.isThanked ? (
                        <span className="flex-shrink-0 px-2 py-1 text-xs font-semibold bg-rose-50 text-rose-500 rounded-lg">감사받음 ❤️</span>
                      ) : isPending ? (
                        <span className="flex-shrink-0 px-2 py-1 text-xs font-semibold bg-amber-50 text-amber-500 rounded-lg">예약됨 ⏰</span>
                      ) : (
                        <span className="flex-shrink-0 px-2 py-1 text-xs bg-gray-100 text-gray-500 rounded-lg">감사 대기</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {isPending && cheer.scheduledTime
                        ? `${format(new Date(cheer.scheduledTime), 'MM/dd HH:mm', { locale: ko })} 발송 예정`
                        : format(new Date(cheer.sentAt || cheer.createdAt), 'MM/dd HH:mm', { locale: ko })}
                    </p>
                    {cheer.isThanked && cheer.thankedAt && (
                      <p className="text-xs text-rose-400 mt-0.5">
                        {format(new Date(cheer.thankedAt), 'MM/dd HH:mm', { locale: ko })} 인증 완료로 감사 수신
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {cheer.replyMessage ? (
                        <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700">답장 도착</span>
                      ) : !isPending ? (
                        <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600">답장 대기</span>
                      ) : null}
                      {cheer.reactionType ? (
                        <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">리액션 {cheer.reactionType}</span>
                      ) : !isPending ? (
                        <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600">리액션 대기</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
