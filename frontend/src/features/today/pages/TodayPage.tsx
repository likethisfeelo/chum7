import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { WorldPage } from './WorldPage';

const REACTION_OPTIONS = ['❤️', '🔥', '👏'] as const;

export const TodayPage = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'today' | 'world'>('today');
  const [replyDraftByCheer, setReplyDraftByCheer] = useState<Record<string, string>>({});

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

  const reactionMutation = useMutation({
    mutationFn: async ({ cheerId, reactionType }: { cheerId: string; reactionType: string }) => {
      const res = await apiClient.post(`/cheers/${cheerId}/reaction`, { reactionType });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-cheers'] });
      toast.success('리액션을 보냈어요');
    },
    onError: () => toast.error('리액션 전송 중 오류가 발생했습니다'),
  });

  const replyMutation = useMutation({
    mutationFn: async ({ cheerId, message }: { cheerId: string; message: string }) => {
      const res = await apiClient.post(`/cheers/${cheerId}/reply`, { message });
      return res.data;
    },
    onSuccess: (_, variables) => {
      setReplyDraftByCheer((prev) => ({ ...prev, [variables.cheerId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['my-cheers'] });
      toast.success('답장을 보냈어요');
    },
    onError: () => toast.error('답장 전송 중 오류가 발생했습니다'),
  });

  const today = format(new Date(), 'yyyy.MM.dd (E)', { locale: ko });

  // 받은 응원: sent 상태만 (receiver_completed는 알림 안 왔으므로 미표시)
  const deliveredReceived = useMemo(
    () => (cheers || []).filter((c: any) => c.status === 'sent'),
    [cheers],
  );
  const unreadCheers = deliveredReceived.filter((c: any) => !c.isRead);

  // 보낸 응원 분리
  const normalSent = useMemo(
    () => (sentCheers || []).filter((c: any) => c.status === 'sent'),
    [sentCheers],
  );
  const receiverCompletedSent = useMemo(
    () => (sentCheers || []).filter((c: any) => c.status === 'receiver_completed'),
    [sentCheers],
  );
  const pendingSent = useMemo(
    () => (sentCheers || []).filter((c: any) => c.status === 'pending'),
    [sentCheers],
  );
  const pendingReceived = useMemo(
    () => (cheers || []).filter((c: any) => c.status === 'pending'),
    [cheers],
  );
  const activeChallenges = useMemo(
    () => myChallengesData?.challenges || [],
    [myChallengesData],
  );
  const totalThankScore = useMemo(
    () => activeChallenges.reduce((sum: number, c: any) => sum + (c.thankScore || 0), 0),
    [activeChallenges],
  );
  const totalCheerScore = useMemo(
    () => activeChallenges.reduce((sum: number, c: any) => sum + (c.cheerScore || 0), 0),
    [activeChallenges],
  );

  if (activeTab === 'world') {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
        {/* 탭 바 */}
        <div className="flex bg-gray-950 border-b border-white/10">
          {(['today', 'world'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab ? 'text-white border-b-2 border-white' : 'text-gray-500'
              }`}
            >
              {tab === 'today' ? '오늘' : '월드'}
            </button>
          ))}
        </div>
        <WorldPage />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 glass-header px-6 py-4 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">오늘 📊</h1>
            <p className="text-sm text-gray-500">📅 {today}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* 월드 탭 전환 */}
            <button
              onClick={() => setActiveTab('world')}
              className="text-xs font-semibold text-purple-600 hover:text-purple-800 px-3 py-1.5 bg-purple-50 rounded-full transition-colors"
            >
              🌍 월드
            </button>
          </div>
        </div>
        {/* 탭 바 */}
        <div className="flex mt-3 -mx-6 px-6 gap-4 border-t border-gray-100 pt-3">
          {(['today', 'world'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-sm font-semibold pb-1 transition-colors ${
                activeTab === tab
                  ? 'text-gray-900 border-b-2 border-gray-900'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab === 'today' ? '오늘' : '🌍 월드'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* 포인트 */}
        {(totalCheerScore > 0 || totalThankScore > 0) && (
          <section className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-4 space-y-3">
            {totalCheerScore > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎟</span>
                <div>
                  <p className="text-sm font-bold text-amber-800">응원 점수</p>
                  <p className="text-xs text-amber-600">목표 시간 전에 인증하고 응원을 보낼 때 쌓여요</p>
                </div>
                <span className="ml-auto text-2xl font-bold text-amber-700">{totalCheerScore}점</span>
              </div>
            )}
            {totalThankScore > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-2xl">✨</span>
                <div>
                  <p className="text-sm font-bold text-amber-800">감사 점수</p>
                  <p className="text-xs text-amber-600">내가 보낸 응원을 받은 팀원이 완료할 때 쌓여요</p>
                </div>
                <span className="ml-auto text-2xl font-bold text-amber-700">{totalThankScore}점</span>
              </div>
            )}
          </section>
        )}

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
                    <div className="flex items-start gap-3">
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
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* 내가 보낸 응원 */}
        {(normalSent.length > 0 || sentCheersLoading) && (
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">내가 보낸 응원 ✉️</h2>
            {sentCheersLoading ? (
              <Loading />
            ) : (
              <div className="space-y-3">
                {normalSent.map((cheer: any) => {
                  const displayMessage = cheer.message
                    || (cheer.delta ? `${cheer.delta}분 일찍 인증해서 보낸 자동 응원` : '자동 응원');
                  return (
                    <div key={cheer.cheerId} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-700 flex-1">{displayMessage}</p>
                        {cheer.isThankScoreGranted ? (
                          <span className="flex-shrink-0 px-2 py-1 text-xs font-semibold bg-amber-50 text-amber-600 rounded-lg">감사 점수 ✨</span>
                        ) : cheer.isThanked ? (
                          <span className="flex-shrink-0 px-2 py-1 text-xs font-semibold bg-rose-50 text-rose-500 rounded-lg">감사받음 ❤️</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {format(new Date(cheer.sentAt || cheer.createdAt), 'MM/dd HH:mm', { locale: ko })}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {cheer.replyMessage ? (
                          <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700">답장 도착</span>
                        ) : (
                          <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600">답장 대기</span>
                        )}
                        {cheer.reactionType && (
                          <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">리액션 {cheer.reactionType}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 효과적인 응원 — receiver_completed */}
        {receiverCompletedSent.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">🎯 효과적인 응원</h2>
            <div className="space-y-2">
              {receiverCompletedSent.map((cheer: any) => (
                <div key={cheer.cheerId} className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-4 border border-emerald-100">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">🎉</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-emerald-800">팀원이 완료했어요!</p>
                      <p className="text-xs text-emerald-600 mt-0.5">
                        {cheer.delta ? `${cheer.delta}분 일찍 인증하고 보낸 응원을 받은 ` : '내 응원을 받은 '}팀원이 목표 시간 전에 완료했어요.
                      </p>
                      <p className="text-xs font-semibold text-amber-600 mt-1">감사 점수 +1이 적립됐어요 ✨</p>
                    </div>
                    {cheer.thankScoreGrantedAt && (
                      <p className="text-[11px] text-gray-400 flex-shrink-0">
                        {format(new Date(cheer.thankScoreGrantedAt), 'HH:mm', { locale: ko })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 응원 예약 중 */}
        {(pendingReceived.length > 0 || pendingSent.length > 0) && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900">🔔 응원 예약 중</h2>
              <span className="text-xs text-gray-400">{pendingReceived.length + pendingSent.length}건</span>
            </div>
            <div className="space-y-2">
              {pendingReceived.map((cheer: any) => {
                const senderName = cheer.senderAlias || '익명의 응원자';
                return (
                  <div key={cheer.cheerId} className="bg-amber-50 rounded-xl p-3 border border-amber-100 flex items-center gap-3">
                    <span className="text-lg flex-shrink-0">📨</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{senderName}의 응원 도착 예정</p>
                      <p className="text-[11px] text-gray-500">목표 시간 전에 응원이 도착해요</p>
                    </div>
                    {cheer.scheduledTime && (
                      <p className="text-[11px] text-amber-600 flex-shrink-0 font-medium">
                        {format(new Date(cheer.scheduledTime), 'HH:mm', { locale: ko })}
                      </p>
                    )}
                  </div>
                );
              })}
              {pendingSent.map((cheer: any) => (
                <div key={cheer.cheerId} className="bg-amber-50 rounded-xl p-3 border border-amber-100 flex items-center gap-3">
                  <span className="text-lg flex-shrink-0">📤</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700">자동 응원 발송 예정</p>
                    <p className="text-[11px] text-gray-500">
                      {cheer.delta ? `${cheer.delta}분 일찍 인증 기준` : '목표 시간 기준'}
                    </p>
                  </div>
                  {cheer.scheduledTime && (
                    <p className="text-[11px] text-orange-600 flex-shrink-0 font-medium">
                      {format(new Date(cheer.scheduledTime), 'HH:mm', { locale: ko })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
};
