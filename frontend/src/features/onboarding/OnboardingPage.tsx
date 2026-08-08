import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { apiClient } from '@/lib/api-client';
import { CHALLENGE_CATEGORIES } from '@/features/challenge/constants/categories';

/**
 * 온보딩 — 가입 직후 3스텝, 1분 컷. 목표는 단 하나: 첫 챌린지 참여.
 *  1) 환영 한 장  2) 관심 카테고리 1~3개  3) 모집 중 챌린지 추천 → 참여 동선
 * 완료는 서버 기록(onboardedAt) — 기기를 바꿔도 다시 뜨지 않는다.
 */

const MAX_INTERESTS = 3;

export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [interests, setInterests] = useState<string[]>([]);

  // 모집 중 챌린지 — 추천 스텝용 (인기순, 관심 카테고리 우선)
  const { data: recruiting } = useQuery({
    queryKey: ['onboarding-recruiting'],
    enabled: step === 3,
    queryFn: async () => {
      const res = await apiClient.get('/public/challenges?lifecycle=recruiting&sortBy=popular&limit=30');
      return (res.data?.data?.challenges ?? []) as any[];
    },
  });

  const recommended = useMemo(() => {
    const list = recruiting ?? [];
    const preferred = interests.length > 0 ? list.filter((c) => interests.includes(c.category)) : list;
    const rest = list.filter((c) => !preferred.includes(c));
    return [...preferred, ...rest].slice(0, 3);
  }, [recruiting, interests]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/u/onboarding/complete', { interests });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
  });

  /** 완료 기록 후 이동 — 기록 실패해도 흐름은 막지 않는다(다음 방문에 다시 뜨는 정도) */
  const completeAndGo = async (to: string) => {
    try {
      await completeMutation.mutateAsync();
    } catch {
      // non-fatal
    }
    navigate(to, { replace: true });
  };

  const toggleInterest = (slug: string) => {
    setInterests((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length >= MAX_INTERESTS
          ? prev
          : [...prev, slug],
    );
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* 진행 점 */}
      <div className="flex justify-center gap-1.5 pt-10">
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            className={`h-1.5 rounded-full transition-all ${s === step ? 'w-6 bg-primary-500' : 'w-1.5 bg-gray-200'}`}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col justify-center px-6 max-w-md mx-auto w-full">
        {step === 1 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <p className="text-5xl">🔥</p>
            <h1 className="mt-4 text-2xl font-extrabold text-gray-900 leading-snug">
              7일간의 짧고
              <br />
              강렬한 챌린지
            </h1>
            <p className="mt-3 text-sm text-gray-500">혼자는 어렵던 습관, 함께라면 완주할 수 있어요.</p>

            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                { emoji: '🎯', label: '챌린지 참여' },
                { emoji: '📸', label: '매일 인증' },
                { emoji: '🏁', label: '완주와 보상' },
              ].map((it) => (
                <div key={it.label} className="rounded-2xl bg-gray-50 py-4">
                  <p className="text-2xl">{it.emoji}</p>
                  <p className="mt-1.5 text-xs font-semibold text-gray-600">{it.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-xl font-extrabold text-gray-900">어떤 변화를 만들고 싶나요?</h1>
            <p className="mt-1.5 text-sm text-gray-500">관심 있는 영역을 골라주세요 (최대 {MAX_INTERESTS}개)</p>
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              {CHALLENGE_CATEGORIES.map((cat) => {
                const on = interests.includes(cat.slug);
                return (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => toggleInterest(cat.slug)}
                    className={`flex items-center gap-2.5 px-4 py-3.5 rounded-2xl border-2 text-left transition-all ${
                      on ? 'border-primary-400 bg-primary-50' : 'border-gray-100 bg-white'
                    }`}
                  >
                    <span className="text-xl">{cat.emoji}</span>
                    <span className={`text-sm font-semibold ${on ? 'text-primary-700' : 'text-gray-700'}`}>
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-xl font-extrabold text-gray-900">지금 모집 중인 챌린지예요</h1>
            <p className="mt-1.5 text-sm text-gray-500">하나 골라 바로 시작해볼까요?</p>
            <div className="mt-5 space-y-2.5">
              {recommended.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">
                  지금 모집 중인 챌린지가 없어요.
                  <br />곧 새 챌린지가 열려요!
                </p>
              ) : (
                recommended.map((c) => (
                  <button
                    key={c.challengeId}
                    type="button"
                    onClick={() => completeAndGo(`/challenges/${c.challengeId}`)}
                    className="w-full text-left rounded-2xl border border-gray-100 bg-white shadow-sm p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-xl flex-shrink-0">
                        {c.badgeIcon || '🎯'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-gray-900 truncate">{c.title}</span>
                        <span className="block text-[11px] text-gray-400 mt-0.5">
                          {c.durationDays ?? 7}일 · 👥 {c.stats?.totalParticipants ?? 0}명 참여 중
                        </span>
                      </span>
                      <span className="text-primary-600 text-xs font-bold flex-shrink-0">참여 →</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* 하단 버튼 */}
      <div className="px-6 pb-10 max-w-md mx-auto w-full space-y-2">
        {step < 3 ? (
          <button
            type="button"
            disabled={step === 2 && interests.length === 0}
            onClick={() => setStep(step + 1)}
            className="w-full py-4 rounded-2xl bg-primary-600 text-white font-bold text-base disabled:opacity-40 hover:bg-primary-700 transition-colors"
          >
            {step === 1 ? '시작하기' : '다음'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => completeAndGo('/challenges')}
            className="w-full py-4 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-sm hover:bg-gray-200 transition-colors"
          >
            나중에 둘러볼게요
          </button>
        )}
        {step === 2 && (
          <button
            type="button"
            onClick={() => setStep(3)}
            className="w-full py-2 text-xs text-gray-400 hover:text-gray-600"
          >
            건너뛰기
          </button>
        )}
      </div>
    </div>
  );
}
