import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { format, nextMonday } from 'date-fns';
import { ko } from 'date-fns/locale';

import { apiClient } from '@/lib/api-client';
import { EmptyState } from '@/shared/components/EmptyState';
import { Loading } from '@/shared/components/Loading';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';
import { dismissRecommendation, fetchPlazaRecommendations, reactPlazaPost } from '@/features/feed/api/plazaApi';

type PlazaFilter = 'all' | 'recruiting' | 'ongoing' | 'records';

type ChallengeCard = {
  challengeId: string;
  title: string;
  leaderName: string;
  startDateLabel: string;
  seatsLabel: string;
  description: string;
  completionRate: number;
};


type MixedPlazaItem = {
  id: string;
  type: 'recruiting' | 'ongoing' | 'record';
  score: number;
  createdAtTs: number;
  payload: ChallengeCard | VerificationRecord;
};

interface Recommendation {
  id: string;
  title: string;
  reason: string;
  challengeId?: string;
}

interface ReactionInput {
  verificationId: string;
  challengeId?: string;
  challengeTitle?: string;
}

interface ChallengeSummary {
  challengeId: string;
  title: string;
  description?: string;
  leaderName?: string;
  ownerName?: string;
  startDate?: string;
  schedule?: { startDate?: string };
  lifecycle?: string;
  maxParticipants?: number;
  capacity?: number;
  stats?: {
    totalParticipants?: number;
    completionRate?: number;
  };
}

interface VerificationRecord {
  verificationId: string;
  challengeId?: string;
  challengeTitle?: string;
  createdAt: string;
  imageUrl?: string;
  todayNote?: string;
}

const ANONYMITY_STORAGE_KEY = 'outer-space-anonymous-mode';
const RECOMMENDATION_DISMISS_KEY = 'outer-space-recommend-dismiss';
const MAX_RECOMMENDATION_EXPOSURE_PER_SESSION = 2;
const RECOMMENDATION_SUPPRESS_HOURS = 48;

const ANONYMOUS_NAMES = ['새벽의 곰', '조용한 호랑이', '집중하는 올빼미', '묵묵한 이무기'];

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

function toChallengeCard(challenge: ChallengeSummary): ChallengeCard {
  const startDateRaw = challenge.startDate || challenge.schedule?.startDate;
  const startDateLabel = startDateRaw
    ? format(new Date(startDateRaw), 'M/d', { locale: ko })
    : '일정 미정';

  const totalParticipants = challenge.stats?.totalParticipants ?? 0;
  const maxParticipants = challenge.maxParticipants ?? challenge.capacity ?? 0;
  const seatsLeft = maxParticipants > 0 ? Math.max(maxParticipants - totalParticipants, 0) : 0;

  return {
    challengeId: challenge.challengeId,
    title: challenge.title,
    leaderName: challenge.leaderName || challenge.ownerName || '리더 비공개',
    startDateLabel,
    seatsLabel: maxParticipants > 0 ? `${seatsLeft}자리 / ${maxParticipants}자리` : `${totalParticipants}명 참여 중`,
    description: challenge.description || '챌린지 소개가 준비 중입니다.',
    completionRate: challenge.stats?.completionRate || 0,
  };
}

function buildFallbackRecommendations(challengeTitle?: string, challengeId?: string): Recommendation[] {
  const base = challengeTitle?.trim() || '관심 챌린지';
  return [
    { id: 'rec-1', title: `${base} 후속 모집`, reason: '반응한 게시물과 연관된 챌린지', challengeId },
    { id: 'rec-2', title: `${base} 리더의 다른 챌린지`, reason: '동일 리더가 연 챌린지' },
    { id: 'rec-3', title: '비슷한 카테고리 챌린지', reason: '관심 카테고리 기반 추천' },
  ];
}

function getDismissMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(RECOMMENDATION_DISMISS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function setDismissMap(map: Record<string, string>) {
  localStorage.setItem(RECOMMENDATION_DISMISS_KEY, JSON.stringify(map));
}

function isSuppressed(challengeId?: string): boolean {
  if (!challengeId) return false;
  const map = getDismissMap();
  const until = map[challengeId];
  if (!until) return false;
  const untilDate = new Date(until);
  if (Number.isNaN(untilDate.getTime()) || untilDate.getTime() < Date.now()) {
    delete map[challengeId];
    setDismissMap(map);
    return false;
  }
  return true;
}


export const FeedPage = () => {
  const [plazaFilter, setPlazaFilter] = useState<PlazaFilter>('all');
  const [isAnonymousMode, setIsAnonymousMode] = useState(false);
  const [reactionCountMap, setReactionCountMap] = useState<Record<string, number>>({});
  const [selectedRecommendations, setSelectedRecommendations] = useState<Recommendation[] | null>(null);
  const [reactingIds, setReactingIds] = useState<Record<string, boolean>>({});
  const [recommendExposeCount, setRecommendExposeCount] = useState(0);

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
    data: challengesData,
    isLoading: isChallengesLoading,
    isError: isChallengesError,
  } = useQuery({
    queryKey: ['challenges', 'outer-space'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges');
      return response.data.data;
    },
  });

  const {
    data: verificationPages,
    isLoading: isRecordsLoading,
    isError: isRecordsError,
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

  const recommendMutation = useMutation({
    mutationFn: async ({ verificationId }: { verificationId: string }) => fetchPlazaRecommendations(verificationId),
  });

  const reactMutation = useMutation({
    mutationFn: async ({ verificationId, challengeId }: ReactionInput) => reactPlazaPost({
      plazaPostId: verificationId,
      verificationId,
      challengeId,
    }),
  });

  const challenges: ChallengeSummary[] = challengesData?.challenges || [];
  const recruitingCards = useMemo(
    () => challenges.filter((c) => String(c.lifecycle) === 'recruiting').map(toChallengeCard),
    [challenges],
  );
  const ongoingCards = useMemo(
    () => challenges.filter((c) => String(c.lifecycle) === 'active').slice(0, 5).map(toChallengeCard),
    [challenges],
  );

  const publicRecords: VerificationRecord[] = verificationPages?.pages?.flatMap((p: any) => p.verifications || []) || [];

  const currentAlias = useMemo(() => ANONYMOUS_NAMES[new Date().getMonth() % ANONYMOUS_NAMES.length], []);
  const nextApplyDate = useMemo(() => format(nextMonday(new Date()), 'M월 d일(E)', { locale: ko }), []);

  const isAllTab = plazaFilter === 'all';
  const showRecruit = plazaFilter === 'recruiting';
  const showOngoing = plazaFilter === 'ongoing';
  const showRecords = plazaFilter === 'records';

  const filterCountMap: Record<PlazaFilter, number> = {
    all: recruitingCards.length + ongoingCards.length + publicRecords.length,
    recruiting: recruitingCards.length,
    ongoing: ongoingCards.length,
    records: publicRecords.length,
  };


  const mixedItems = useMemo<MixedPlazaItem[]>(() => {
    const now = Date.now();
    const recruitItems: MixedPlazaItem[] = recruitingCards.map((card) => {
      const createdAtTs = now;
      const freshness = 100;
      const reactionScore = 0;
      const typeWeight = 1.3;
      return {
        id: `mix-recruit-${card.challengeId}`,
        type: 'recruiting',
        score: freshness + reactionScore + typeWeight,
        createdAtTs,
        payload: card,
      };
    });

    const ongoingItems: MixedPlazaItem[] = ongoingCards.map((card) => {
      const createdAtTs = now;
      const freshness = 70;
      const reactionScore = card.completionRate * 0.5;
      const typeWeight = 1.0;
      return {
        id: `mix-ongoing-${card.challengeId}`,
        type: 'ongoing',
        score: freshness + reactionScore + typeWeight,
        createdAtTs,
        payload: card,
      };
    });

    const recordItems: MixedPlazaItem[] = publicRecords.map((record) => {
      const createdAtTs = new Date(record.createdAt).getTime() || now;
      const ageHours = Math.max((now - createdAtTs) / (1000 * 60 * 60), 0);
      const freshness = 100 * Math.exp(-ageHours / 6);
      const likeCount = reactionCountMap[record.verificationId] ?? 0;
      const commentCount = 0;
      const bookmarkCount = 0;
      const reactionScore = (likeCount * 1) + (commentCount * 2) + (bookmarkCount * 1.5);
      const typeWeight = 1.0;
      return {
        id: `mix-record-${record.verificationId}`,
        type: 'record',
        score: freshness + reactionScore + typeWeight,
        createdAtTs,
        payload: record,
      };
    });

    return [...recruitItems, ...ongoingItems, ...recordItems].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.createdAtTs - a.createdAtTs;
    });
  }, [recruitingCards, ongoingCards, publicRecords, reactionCountMap]);

  const reactToRecord = async ({ verificationId, challengeId, challengeTitle }: ReactionInput) => {
    setReactingIds((prev) => ({ ...prev, [verificationId]: true }));
    setReactionCountMap((prev) => ({ ...prev, [verificationId]: (prev[verificationId] ?? 0) + 1 }));

    let reactResponse: any = null;
    try {
      reactResponse = await reactMutation.mutateAsync({ verificationId, challengeId, challengeTitle });
      if (typeof reactResponse?.likeCount === 'number') {
        setReactionCountMap((prev) => ({ ...prev, [verificationId]: reactResponse.likeCount }));
      }
    } catch {
      // no-op: fallback UI keeps optimistic reaction count
    }

    const canExposeRecommend = recommendExposeCount < MAX_RECOMMENDATION_EXPOSURE_PER_SESSION;
    if (!canExposeRecommend) {
      setReactingIds((prev) => ({ ...prev, [verificationId]: false }));
      return;
    }

    const reactInlineRecommendation = reactResponse?.recommendation;
    if (reactInlineRecommendation && !isSuppressed(reactInlineRecommendation.challengeId)) {
      setSelectedRecommendations([{
        id: String(reactInlineRecommendation.recommendationId || `rec-inline-${verificationId}`),
        title: reactInlineRecommendation.challengeTitle || '추천 챌린지',
        reason: reactInlineRecommendation.message || '방금 공감한 기록과 연관된 챌린지예요.',
        challengeId: reactInlineRecommendation.challengeId,
      }]);
      setRecommendExposeCount((prev) => prev + 1);
      setReactingIds((prev) => ({ ...prev, [verificationId]: false }));
      return;
    }

    try {
      const recommended = await recommendMutation.mutateAsync({ verificationId });
      const normalized = Array.isArray(recommended)
        ? recommended
          .map((item: any, idx: number) => ({
            id: String(item.id || `rec-${idx + 1}`),
            title: item.title || item.challengeTitle || '추천 챌린지',
            reason: item.reason || '관심 반응 기반 추천',
            challengeId: item.challengeId,
          }))
          .filter((item: Recommendation) => !isSuppressed(item.challengeId))
        : [];

      if (normalized.length > 0) {
        setSelectedRecommendations(normalized);
        setRecommendExposeCount((prev) => prev + 1);
      } else {
        const fallback = buildFallbackRecommendations(challengeTitle, challengeId).filter((item) => !isSuppressed(item.challengeId));
        if (fallback.length > 0) {
          setSelectedRecommendations(fallback);
          setRecommendExposeCount((prev) => prev + 1);
        }
      }
    } catch {
      const fallback = buildFallbackRecommendations(challengeTitle, challengeId).filter((item) => !isSuppressed(item.challengeId));
      if (fallback.length > 0) {
        setSelectedRecommendations(fallback);
        setRecommendExposeCount((prev) => prev + 1);
      }
    } finally {
      setReactingIds((prev) => ({ ...prev, [verificationId]: false }));
    }
  };

  const dismissRecommendationItem = async (item: Recommendation) => {
    if (!item.challengeId) return;

    const map = getDismissMap();
    const until = new Date(Date.now() + RECOMMENDATION_SUPPRESS_HOURS * 60 * 60 * 1000).toISOString();
    map[item.challengeId] = until;
    setDismissMap(map);

    setSelectedRecommendations((prev) => (prev ? prev.filter((r) => r.challengeId !== item.challengeId) : prev));
    await dismissRecommendation(item.id);
  };


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
        <h1 className="text-2xl font-bold text-gray-900">마당 (Outer Space) 🚀</h1>
        <p className="text-sm text-gray-500">실데이터 기반 광장 피드 · 반익명 + 리더 + 변환 흐름</p>
      </div>

      <div className="px-6 py-6 space-y-4">
        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900">반익명 활동명</h2>
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
          <h2 className="text-sm font-bold text-gray-900 mb-2">마당 자동 변환 규칙</h2>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• 챌린지 내부 인증 → 다음날 마당 카드(C) 공개</li>
            <li>• 작성자/동물 아이콘 제거, 작성자는 항상 비공개</li>
            <li>• 마당 반응 후 연관 챌린지 추천</li>
          </ul>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">광장 피드</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPlazaFilter(tab.key)}
                className={`px-3 py-1.5 text-xs rounded-full border ${plazaFilter === tab.key ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                {tab.label} ({filterCountMap[tab.key]})
              </button>
            ))}
          </div>


          <div className="space-y-3">
            {isAllTab && (
              <>
                {isChallengesLoading || isRecordsLoading ? (
                  <Loading />
                ) : mixedItems.length === 0 ? (
                  <EmptyState icon="🛰️" title="광장 콘텐츠가 아직 없어요" description="모집 공고/진행 업데이트/완주 기록이 순차적으로 노출됩니다." />
                ) : (
                  <>
                    {mixedItems.map((item) => {
                      if (item.type === 'recruiting') {
                        const card = item.payload as ChallengeCard;
                        return (
                          <motion.article key={item.id} className="border border-gray-200 rounded-2xl p-4">
                            <p className="text-[11px] text-primary-700 font-semibold">카드 A · 모집 공고</p>
                            <h3 className="font-semibold text-gray-900 mt-1">{card.title}</h3>
                            <p className="text-xs text-gray-500 mt-1">리더: {card.leaderName} · 시작일: {card.startDateLabel}</p>
                            <p className="text-xs text-primary-700 mt-1">잔여: {card.seatsLabel}</p>
                            <Link to={`/challenges/${card.challengeId}`} className="inline-block mt-3 px-3 py-1.5 text-xs rounded-lg bg-gray-900 text-white">참여하기</Link>
                          </motion.article>
                        );
                      }

                      if (item.type === 'ongoing') {
                        const card = item.payload as ChallengeCard;
                        return (
                          <article key={item.id} className="border border-gray-200 rounded-2xl p-4 bg-indigo-50/40">
                            <p className="text-[11px] text-indigo-700 font-semibold">카드 B · 진행 중 업데이트</p>
                            <h3 className="font-semibold text-gray-900 mt-1">{card.title}</h3>
                            <p className="text-xs text-gray-600 mt-1">리더: {card.leaderName} · 완주율 {card.completionRate}%</p>
                            <Link to={`/challenges/${card.challengeId}`} className="inline-block mt-3 text-xs text-indigo-700 underline">구경하기</Link>
                          </article>
                        );
                      }

                      const record = item.payload as VerificationRecord;
                      return (
                        <article key={item.id} className="border border-gray-200 rounded-2xl p-4 bg-emerald-50/40">
                          <p className="text-[11px] text-emerald-700 font-semibold">카드 C · 마당 게시물(익명)</p>
                          <h3 className="font-semibold text-gray-900 mt-1">📚 {record.challengeTitle || '챌린지 인증 기록'}</h3>
                          <p className="text-xs text-gray-500 mt-1">작성자: 비공개 · {format(new Date(record.createdAt), 'M월 d일 HH:mm', { locale: ko })}</p>
                          {record.todayNote && <p className="text-sm text-gray-700 mt-3">{record.todayNote}</p>}
                          <button
                            type="button"
                            onClick={() => reactToRecord({ verificationId: record.verificationId, challengeTitle: record.challengeTitle, challengeId: record.challengeId })}
                            disabled={Boolean(reactingIds[record.verificationId])}
                            className="mt-3 px-2.5 py-1 text-xs rounded-lg border border-emerald-200 bg-white text-emerald-700 disabled:opacity-50"
                          >
                            {reactingIds[record.verificationId] ? '저장 중...' : `반응 남기기 ❤️ ${reactionCountMap[record.verificationId] ?? 0}`}
                          </button>
                        </article>
                      );
                    })}

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

            {showRecruit && (
              <>
                {isChallengesLoading ? (
                  <Loading />
                ) : isChallengesError ? (
                  <EmptyState icon="⚠️" title="모집 데이터를 불러오지 못했어요" description="잠시 후 다시 시도해주세요." />
                ) : recruitingCards.length === 0 ? (
                  <EmptyState icon="📣" title="모집 중인 챌린지가 없어요" description="리더가 새 모집 공고를 올리면 여기에 표시됩니다." />
                ) : recruitingCards.map((card: ChallengeCard, index: number) => (
                  <motion.article
                    key={card.challengeId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="border border-gray-200 rounded-2xl p-4"
                  >
                    <p className="text-[11px] text-primary-700 font-semibold">카드 A · 모집 공고</p>
                    <h3 className="font-semibold text-gray-900 mt-1">{card.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">리더: {card.leaderName} · 시작일: {card.startDateLabel}</p>
                    <p className="text-xs text-primary-700 mt-1">잔여: {card.seatsLabel}</p>
                    <p className="text-sm text-gray-700 mt-2">“{card.description}”</p>
                    <Link to={`/challenges/${card.challengeId}`} className="inline-block mt-3 px-3 py-1.5 text-xs rounded-lg bg-gray-900 text-white">참여하기</Link>
                  </motion.article>
                ))}
              </>
            )}

            {showOngoing && (
              <>
                {isChallengesLoading ? (
                  <Loading />
                ) : isChallengesError ? (
                  <EmptyState icon="⚠️" title="진행 데이터를 불러오지 못했어요" description="잠시 후 다시 시도해주세요." />
                ) : ongoingCards.length === 0 ? (
                  <EmptyState icon="🏁" title="진행 중인 챌린지가 없어요" description="진행 중 업데이트가 생기면 여기에 표시됩니다." />
                ) : ongoingCards.map((card: ChallengeCard) => (
                  <article key={`ongoing-${card.challengeId}`} className="border border-gray-200 rounded-2xl p-4 bg-indigo-50/40">
                    <p className="text-[11px] text-indigo-700 font-semibold">카드 B · 진행 중 업데이트</p>
                    <h3 className="font-semibold text-gray-900 mt-1">{card.title}</h3>
                    <p className="text-xs text-gray-600 mt-1">리더: {card.leaderName} · 완주율 {card.completionRate}%</p>
                    <p className="text-sm text-gray-700 mt-2">"진행 데이터 기반으로 업데이트가 표시됩니다."</p>
                    <Link to={`/challenges/${card.challengeId}`} className="inline-block mt-3 text-xs text-indigo-700 underline">구경하기</Link>
                  </article>
                ))}
              </>
            )}

            {showRecords && (
              <>
                {isRecordsLoading ? (
                  <Loading />
                ) : isRecordsError ? (
                  <EmptyState icon="⚠️" title="마당 기록을 불러오지 못했어요" description="네트워크 상태를 확인하고 다시 시도해주세요." />
                ) : publicRecords.length === 0 ? (
                  <EmptyState icon="🌌" title="아직 공개 기록이 없어요" description="다음날 자동 변환되는 마당 게시물이 여기에 표시됩니다." />
                ) : (
                  <>
                    {publicRecords.map((record) => (
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
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => reactToRecord({ verificationId: record.verificationId, challengeTitle: record.challengeTitle, challengeId: record.challengeId })}
                            disabled={Boolean(reactingIds[record.verificationId])}
                            className="px-2.5 py-1 text-xs rounded-lg border border-emerald-200 bg-white text-emerald-700 disabled:opacity-50"
                          >
                            {reactingIds[record.verificationId] ? '저장 중...' : `반응 남기기 ❤️ ${reactionCountMap[record.verificationId] ?? 0}`}
                          </button>
                        </div>
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

        {selectedRecommendations && (
          <section className="bg-white border border-primary-200 rounded-2xl p-4">
            <h2 className="text-sm font-bold text-primary-700">관심 가질 만한 챌린지가 있어요</h2>
            <div className="mt-2 space-y-2">
              {selectedRecommendations.map((item) => (
                <article key={item.id} className="rounded-xl border border-primary-100 bg-primary-50 px-3 py-2">
                  <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-600 mt-1">{item.reason}</p>
                  <div className="mt-2 flex items-center gap-3">
                    {item.challengeId && (
                      <Link to={`/challenges/${item.challengeId}`} className="text-xs text-primary-700 underline">
                        챌린지 보기
                      </Link>
                    )}
                    <button
                      type="button"
                      className="text-xs text-gray-500 underline"
                      onClick={() => {
                        void dismissRecommendationItem(item);
                      }}
                    >
                      닫기
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
