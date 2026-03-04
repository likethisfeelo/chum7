import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { format, nextMonday } from 'date-fns';
import { ko } from 'date-fns/locale';

import { apiClient } from '@/lib/api-client';
import { EmptyState } from '@/shared/components/EmptyState';
import { Loading } from '@/shared/components/Loading';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';

type PlazaFilter = 'all' | 'recruiting' | 'ongoing' | 'records';
type LeaderVisibility = 'public' | 'anonymous';

interface RecruitCard {
  id: string;
  title: string;
  leaderName: string;
  leaderVisibility: LeaderVisibility;
  startDate: string;
  seatsLeft: number;
  seatsTotal: number;
  summary: string;
}

interface OngoingCard {
  id: string;
  title: string;
  leaderName: string;
  completionRate: number;
  summary: string;
  dday: number;
}

const ANONYMITY_STORAGE_KEY = 'outer-space-anonymous-mode';
const ANONYMOUS_NAMES = ['새벽의 곰', '조용한 호랑이', '집중하는 올빼미', '묵묵한 이무기'];

const RECRUIT_CARDS: RecruitCard[] = [
  {
    id: 'leader-1',
    title: '🔥 새벽 기상 챌린지 모집 중',
    leaderName: 'Dark',
    leaderVisibility: 'public',
    startDate: '3/10',
    seatsLeft: 3,
    seatsTotal: 12,
    summary: '매일 5시에 일어나는 루틴을 14일 동안 함께 만듭니다.',
  },
  {
    id: 'leader-2',
    title: '📚 독서 루틴 챌린지 모집 중',
    leaderName: '익명 리더',
    leaderVisibility: 'anonymous',
    startDate: '3/14',
    seatsLeft: 5,
    seatsTotal: 20,
    summary: '리더 노하우 카드와 함께 하루 20분 독서 루틴을 완주해요.',
  },
];

const ONGOING_CARDS: OngoingCard[] = [
  {
    id: 'ongoing-1',
    title: '📍 새벽 기상 D-4',
    leaderName: 'Dark',
    completionRate: 83,
    summary: '오늘도 모두 잘 하고 있어요. 기상 체크 후 물 한 잔 꼭 마셔요!',
    dday: 4,
  },
];

const PHASE_ITEMS = [
  { phase: 'Phase 1', feature: '반익명 ON/OFF, 리더 모집 카드(A), 광장 기본 탐색', status: '진행 중' },
  { phase: 'Phase 2', feature: '카드 B/C 고도화, 마당 자동 변환, 반응 기반 추천', status: '준비' },
  { phase: 'Phase 3', feature: '리더 수익화, 등급제, 유료 챌린지 운영', status: '예정' },
] as const;

const FILTER_TABS: Array<{ key: PlazaFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'recruiting', label: '모집 중' },
  { key: 'ongoing', label: '진행 중' },
  { key: 'records', label: '완주 기록' },
];

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('.m4v');
}

export const FeedPage = () => {
  const [plazaFilter, setPlazaFilter] = useState<PlazaFilter>('all');
  const [isAnonymousMode, setIsAnonymousMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(ANONYMITY_STORAGE_KEY);
    setIsAnonymousMode(saved === 'true');
  }, []);

  const toggleAnonymousMode = () => {
    setIsAnonymousMode((prev) => {
      const next = !prev;
      localStorage.setItem(ANONYMITY_STORAGE_KEY, String(next));
      return next;
    });
  };

  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['verifications', 'public', 'outer-space'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const nextTokenQuery = pageParam ? `&nextToken=${encodeURIComponent(pageParam)}` : '';
      const response = await apiClient.get(`/verifications?isPublic=true&limit=10${nextTokenQuery}`);
      return response.data.data;
    },
    getNextPageParam: (lastPage) => lastPage?.nextToken || undefined,
  });

  const publicRecords = data?.pages?.flatMap((p: any) => p.verifications || []) || [];

  const currentAlias = useMemo(() => ANONYMOUS_NAMES[new Date().getMonth() % ANONYMOUS_NAMES.length], []);
  const nextApplyDate = useMemo(() => format(nextMonday(new Date()), 'M월 d일(E)', { locale: ko }), []);

  const showRecruit = plazaFilter === 'all' || plazaFilter === 'recruiting';
  const showOngoing = plazaFilter === 'all' || plazaFilter === 'ongoing';
  const showRecords = plazaFilter === 'all' || plazaFilter === 'records';

  const filterCountMap: Record<PlazaFilter, number | null> = {
    all: RECRUIT_CARDS.length + ONGOING_CARDS.length + publicRecords.length,
    recruiting: RECRUIT_CARDS.length,
    ongoing: ONGOING_CARDS.length,
    records: publicRecords.length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
        <h1 className="text-2xl font-bold text-gray-900">마당 (Outer Space) 🚀</h1>
        <p className="text-sm text-gray-500">1·5·6번 기획 고도화 · 페이즈별 확장 준비</p>
      </div>

      <div className="px-6 py-6 space-y-4">
        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-2">개발 페이즈 로드맵</h2>
          <div className="space-y-2">
            {PHASE_ITEMS.map((item) => (
              <div key={item.phase} className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
                <p className="text-xs font-semibold text-primary-700">{item.phase} · {item.status}</p>
                <p className="text-xs text-gray-600 mt-1">{item.feature}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900">1) 반익명 활동명</h2>
              <p className="text-xs text-gray-600 mt-1">설정은 기기 저장 후 다음 주부터 적용 (진행중 챌린지 유지)</p>
            </div>
            <button
              type="button"
              onClick={toggleAnonymousMode}
              className={`px-3 py-1.5 text-xs rounded-full border ${isAnonymousMode ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              익명 활동 {isAnonymousMode ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="mt-3 text-xs text-gray-600 space-y-1">
            <p>• 이번 달 활동명: {isAnonymousMode ? currentAlias : '닉네임 사용'}</p>
            <p>• 다음 적용일: {nextApplyDate}</p>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-2">5) 챌린지 리더 시스템</h2>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• 공개 리더(👑): 브랜드 기반 모집/진행 현황 공개</li>
            <li>• 익명 리더(🐻): 노하우 중심 반익명 운영</li>
            <li>• 완주 후 리더 피드/후속 모집으로 자연 전환</li>
          </ul>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">6) 광장 피드</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPlazaFilter(tab.key)}
                className={`px-3 py-1.5 text-xs rounded-full border ${plazaFilter === tab.key ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                {tab.label} {filterCountMap[tab.key] !== null ? `(${filterCountMap[tab.key]})` : ''}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {showRecruit && RECRUIT_CARDS.map((card, index) => (
              <motion.article
                key={card.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="border border-gray-200 rounded-2xl p-4"
              >
                <p className="text-[11px] text-primary-700 font-semibold">카드 A · 모집 공고</p>
                <h3 className="font-semibold text-gray-900 mt-1">{card.title}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  리더: {card.leaderName}{card.leaderVisibility === 'public' ? ' 👑' : ' 🐻'} · 시작일: {card.startDate}
                </p>
                <p className="text-xs text-primary-700 mt-1">잔여: {card.seatsLeft}자리 / {card.seatsTotal}자리</p>
                <p className="text-sm text-gray-700 mt-2">“{card.summary}”</p>
                <button type="button" className="mt-3 px-3 py-1.5 text-xs rounded-lg bg-gray-900 text-white">참여하기</button>
              </motion.article>
            ))}

            {showOngoing && ONGOING_CARDS.map((card) => (
              <article key={card.id} className="border border-gray-200 rounded-2xl p-4 bg-indigo-50/40">
                <p className="text-[11px] text-indigo-700 font-semibold">카드 B · 진행 중 업데이트 (Phase 2)</p>
                <h3 className="font-semibold text-gray-900 mt-1">{card.title}</h3>
                <p className="text-xs text-gray-600 mt-1">리더: {card.leaderName} · 완주율 {card.completionRate}% · D-{card.dday}</p>
                <p className="text-sm text-gray-700 mt-2">“{card.summary}”</p>
              </article>
            ))}

            {showRecords && (
              <>
                {isLoading ? (
                  <Loading />
                ) : publicRecords.length === 0 ? (
                  <EmptyState icon="🌌" title="아직 공개 기록이 없어요" description="다음날 자동 변환되는 마당 게시물이 여기에 표시됩니다." />
                ) : (
                  <>
                    {publicRecords.map((record: any) => (
                      <article key={record.verificationId} className="border border-gray-200 rounded-2xl p-4 bg-emerald-50/40">
                        <p className="text-[11px] text-emerald-700 font-semibold">카드 C · 마당 게시물(익명)</p>
                        <h3 className="font-semibold text-gray-900 mt-1">📚 {record.challengeTitle || '챌린지 인증 기록'}</h3>
                        <p className="text-xs text-gray-500 mt-1">작성자: 비공개 · {format(new Date(record.createdAt), 'M월 d일 HH:mm', { locale: ko })}</p>
                        {record.imageUrl && (
                          isVideoUrl(record.imageUrl)
                            ? <video src={resolveMediaUrl(record.imageUrl)} controls className="w-full h-44 object-cover rounded-xl mt-3 bg-black" />
                            : <img src={resolveMediaUrl(record.imageUrl)} alt="마당 인증" className="w-full h-44 object-cover rounded-xl mt-3" />
                        )}
                        {record.todayNote && <p className="text-sm text-gray-700 mt-3">{record.todayNote}</p>}
                      </article>
                    ))}

                    {hasNextPage && (
                      <button
                        type="button"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="w-full py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 disabled:opacity-50"
                      >
                        {isFetchingNextPage ? '불러오는 중...' : '완주 기록 더보기'}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
