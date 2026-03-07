import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

type PeriodType = 'all' | 'day' | 'week' | 'month' | 'challenge';

const REACTION_OPTIONS = ['❤️', '🔥', '👏'] as const;

export const TodayPage = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodType>('all');
  const [day, setDay] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [week, setWeek] = useState('');
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [challengeId, setChallengeId] = useState('');
  const [replyDraftByCheer, setReplyDraftByCheer] = useState<Record<string, string>>({});

  const { data: cheers, isLoading: cheersLoading } = useQuery({
    queryKey: ['my-cheers'],
    queryFn: async () => {
      const response = await apiClient.get('/cheer/my-cheers?limit=20');
      return response.data.data.cheers;
    },
  });

  const statsQueryString = useMemo(() => {
    const params = new URLSearchParams({ period });
    if (period === 'day') params.set('day', day);
    if (period === 'week' && week.trim()) params.set('week', week.trim());
    if (period === 'month') params.set('month', month);
    if (period === 'challenge' && challengeId.trim()) params.set('challengeId', challengeId.trim());
    return params.toString();
  }, [period, day, week, month, challengeId]);

  const { data: cheerStats, isLoading: statsLoading } = useQuery({
    queryKey: ['cheer-stats', statsQueryString],
    queryFn: async () => {
      const response = await apiClient.get(`/cheers/stats?${statsQueryString}`);
      return response.data.data;
    }
  });

  const thankMutation = useMutation({
    mutationFn: async (cheerId: string) => {
      const response = await apiClient.post(`/cheers/${cheerId}/thank`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-cheers'] });
      queryClient.invalidateQueries({ queryKey: ['cheer-stats'] });
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
      queryClient.invalidateQueries({ queryKey: ['cheer-stats'] });
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
      queryClient.invalidateQueries({ queryKey: ['cheer-stats'] });
      toast.success('답장을 보냈어요');
    },
    onError: () => {
      toast.error('답장 전송 중 오류가 발생했습니다');
    }
  });

  const today = format(new Date(), 'M월 d일 (E)', { locale: ko });
  const unreadCheers = cheers?.filter((c: any) => !c.isRead) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">투데이 📊</h1>
            <p className="text-sm text-gray-500">{today}</p>
          </div>
          <button
            onClick={() => navigate('/ux-plan')}
            className="px-3 py-2 rounded-xl bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors"
          >
            PHASE1-2 테스트
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
          <h2 className="text-base font-bold text-gray-900">응원 통계</h2>
          <div className="flex flex-wrap gap-2">
            {(['all', 'day', 'week', 'month', 'challenge'] as PeriodType[]).map((value) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${period === value ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {value}
              </button>
            ))}
          </div>
          {period === 'day' && (
            <input className="w-full border rounded-xl px-3 py-2 text-sm" value={day} onChange={(e) => setDay(e.target.value)} placeholder="YYYY-MM-DD" />
          )}
          {period === 'week' && (
            <input className="w-full border rounded-xl px-3 py-2 text-sm" value={week} onChange={(e) => setWeek(e.target.value)} placeholder="YYYY-Www (예: 2026-W10)" />
          )}
          {period === 'month' && (
            <input className="w-full border rounded-xl px-3 py-2 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} placeholder="YYYY-MM" />
          )}
          {period === 'challenge' && (
            <input className="w-full border rounded-xl px-3 py-2 text-sm" value={challengeId} onChange={(e) => setChallengeId(e.target.value)} placeholder="challengeId" />
          )}

          {statsLoading ? (
            <Loading />
          ) : (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-gray-50 rounded-xl p-3">보낸 응원: <b>{cheerStats?.stats?.sentCount ?? 0}</b></div>
              <div className="bg-gray-50 rounded-xl p-3">받은 응원: <b>{cheerStats?.stats?.receivedCount ?? 0}</b></div>
              <div className="bg-gray-50 rounded-xl p-3">감사 수: <b>{cheerStats?.stats?.thankedCount ?? 0}</b></div>
              <div className="bg-gray-50 rounded-xl p-3">답장 수: <b>{cheerStats?.stats?.repliedCount ?? 0}</b></div>
              <div className="bg-gray-50 rounded-xl p-3">리액션 수: <b>{cheerStats?.stats?.reactionCount ?? 0}</b></div>
              <div className="bg-gray-50 rounded-xl p-3">기간 라벨: <b>{cheerStats?.label ?? 'all'}</b></div>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">받은 응원 💌</h2>
            {unreadCheers.length > 0 && (
              <span className="px-2 py-0.5 bg-primary-100 text-primary-600 text-xs font-bold rounded-full">
                새 응원 {unreadCheers.length}개
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
              {cheers.map((cheer: any, index: number) => (
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
                        <p className="font-semibold text-gray-900 mb-1">익명의 응원자</p>
                        <p className="text-gray-700 text-sm leading-relaxed">{cheer.message}</p>
                        <p className="text-xs text-gray-400 mt-2">
                          {format(new Date(cheer.createdAt || cheer.sentAt), 'MM/dd HH:mm', { locale: ko })}
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
                            <p className="text-xs text-indigo-700 bg-indigo-50 rounded-xl p-2">답장: {cheer.replyMessage}</p>
                          ) : (
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
                          )}
                        </div>
                      </div>
                    </div>
                    {!cheer.isThanked ? (
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
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
