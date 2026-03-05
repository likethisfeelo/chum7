import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { format, nextMonday } from 'date-fns';
import { ko } from 'date-fns/locale';

import { EmptyState } from '@/shared/components/EmptyState';
import { Loading } from '@/shared/components/Loading';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';
import {
  createPlazaComment,
  dismissRecommendation,
  fetchPlazaCommentsPage,
  fetchPlazaFeed,
  fetchPlazaRecommendations,
  PlazaComment,
  PlazaPost,
  reactPlazaPost,
} from '@/features/feed/api/plazaApi';

type PlazaFilter = 'all' | 'recruiting' | 'ongoing' | 'records';

interface Recommendation {
  id: string;
  title: string;
  reason: string;
  challengeId?: string;
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

function mapFilterToApi(filter: PlazaFilter): 'all' | 'recruiting' | 'in_progress' | 'completed' {
  if (filter === 'recruiting') return 'recruiting';
  if (filter === 'ongoing') return 'in_progress';
  if (filter === 'records') return 'completed';
  return 'all';
}

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('.m4v');
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
  const [commentOpenMap, setCommentOpenMap] = useState<Record<string, boolean>>({});
  const [commentLoadingMap, setCommentLoadingMap] = useState<Record<string, boolean>>({});
  const [commentSubmittingMap, setCommentSubmittingMap] = useState<Record<string, boolean>>({});
  const [commentInputMap, setCommentInputMap] = useState<Record<string, string>>({});
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, PlazaComment[]>>({});
  const [commentCountMap, setCommentCountMap] = useState<Record<string, number>>({});
  const [commentNextCursorMap, setCommentNextCursorMap] = useState<Record<string, string | null>>({});
  const [commentHasMoreMap, setCommentHasMoreMap] = useState<Record<string, boolean>>({});
  const [commentFetchingMoreMap, setCommentFetchingMoreMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem(ANONYMITY_STORAGE_KEY);
    setIsAnonymousMode(saved === 'true');
  }, []);

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['plaza-feed', plazaFilter],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => fetchPlazaFeed({
      filter: mapFilterToApi(plazaFilter),
      cursor: pageParam,
      limit: 20,
    }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
  });

  const posts: PlazaPost[] = useMemo(
    () => data?.pages?.flatMap((page) => page.posts || []) || [],
    [data],
  );

  useEffect(() => {
    setReactionCountMap((prev) => {
      const next = { ...prev };
      posts.forEach((post) => {
        if (next[post.plazaPostId] === undefined) {
          next[post.plazaPostId] = Number(post.likeCount || 0);
        }
      });
      return next;
    });
  }, [posts]);

  useEffect(() => {
    setCommentCountMap((prev) => {
      const next = { ...prev };
      posts.forEach((post) => {
        if (next[post.plazaPostId] === undefined) {
          next[post.plazaPostId] = Number(post.commentCount || 0);
        }
      });
      return next;
    });
  }, [posts]);

  const currentAlias = useMemo(() => ANONYMOUS_NAMES[new Date().getMonth() % ANONYMOUS_NAMES.length], []);
  const nextApplyDate = useMemo(() => format(nextMonday(new Date()), 'M월 d일(E)', { locale: ko }), []);

  const reactMutation = useMutation({
    mutationFn: async (post: PlazaPost) => reactPlazaPost({
      plazaPostId: post.plazaPostId,
    }),
  });

  const recommendMutation = useMutation({
    mutationFn: async (post: PlazaPost) => fetchPlazaRecommendations({ plazaPostId: post.plazaPostId }),
  });

  const reactToPost = async (post: PlazaPost) => {
    setReactingIds((prev) => ({ ...prev, [post.plazaPostId]: true }));
    setReactionCountMap((prev) => ({ ...prev, [post.plazaPostId]: (prev[post.plazaPostId] ?? 0) + 1 }));

    let reactResponse: any = null;
    try {
      reactResponse = await reactMutation.mutateAsync(post);
      if (typeof reactResponse?.likeCount === 'number') {
        setReactionCountMap((prev) => ({ ...prev, [post.plazaPostId]: reactResponse.likeCount }));
      }
    } catch {
      // optimistic value fallback
    }

    if (recommendExposeCount >= MAX_RECOMMENDATION_EXPOSURE_PER_SESSION) {
      setReactingIds((prev) => ({ ...prev, [post.plazaPostId]: false }));
      return;
    }

    const inline = reactResponse?.recommendation;
    if (inline && !isSuppressed(inline.challengeId)) {
      setSelectedRecommendations([{
        id: String(inline.recommendationId || `rec-inline-${post.plazaPostId}`),
        title: inline.challengeTitle || post.challengeTitle || '추천 챌린지',
        reason: inline.message || '방금 공감한 기록과 연관된 챌린지예요.',
        challengeId: inline.challengeId,
      }]);
      setRecommendExposeCount((prev) => prev + 1);
      setReactingIds((prev) => ({ ...prev, [post.plazaPostId]: false }));
      return;
    }

    try {
      const recommended = await recommendMutation.mutateAsync(post);
      const normalized = (recommended || [])
        .map((item: any, idx: number) => ({
          id: String(item.id || `rec-${idx + 1}`),
          title: item.title || item.challengeTitle || '추천 챌린지',
          reason: item.reason || '관심 반응 기반 추천',
          challengeId: item.challengeId,
        }))
        .filter((item: Recommendation) => !isSuppressed(item.challengeId));

      if (normalized.length > 0) {
        setSelectedRecommendations(normalized);
        setRecommendExposeCount((prev) => prev + 1);
      }
    } finally {
      setReactingIds((prev) => ({ ...prev, [post.plazaPostId]: false }));
    }
  };


  const toggleComments = async (postId: string) => {
    const isOpen = Boolean(commentOpenMap[postId]);
    if (isOpen) {
      setCommentOpenMap((prev) => ({ ...prev, [postId]: false }));
      return;
    }

    setCommentOpenMap((prev) => ({ ...prev, [postId]: true }));
    if (commentsByPostId[postId]) return;

    setCommentLoadingMap((prev) => ({ ...prev, [postId]: true }));
    try {
      const page = await fetchPlazaCommentsPage({ plazaPostId: postId, limit: 30 });
      const comments = page.comments || [];
      setCommentsByPostId((prev) => ({ ...prev, [postId]: comments }));
      setCommentCountMap((prev) => ({ ...prev, [postId]: comments.length }));
      setCommentHasMoreMap((prev) => ({ ...prev, [postId]: Boolean(page.hasMore) }));
      setCommentNextCursorMap((prev) => ({ ...prev, [postId]: page.nextCursor || null }));
    } finally {
      setCommentLoadingMap((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const submitComment = async (postId: string) => {
    const content = (commentInputMap[postId] || '').trim();
    if (!content) return;

    setCommentSubmittingMap((prev) => ({ ...prev, [postId]: true }));
    try {
      const created = await createPlazaComment(postId, content);
      if (created) {
        setCommentsByPostId((prev) => ({ ...prev, [postId]: [created, ...(prev[postId] || [])] }));
        setCommentCountMap((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }));
        setCommentInputMap((prev) => ({ ...prev, [postId]: '' }));
      }
    } finally {
      setCommentSubmittingMap((prev) => ({ ...prev, [postId]: false }));
    }
  };


  const loadMoreComments = async (postId: string) => {
    if (!commentHasMoreMap[postId]) return;
    if (commentFetchingMoreMap[postId]) return;

    setCommentFetchingMoreMap((prev) => ({ ...prev, [postId]: true }));
    try {
      const page = await fetchPlazaCommentsPage({
        plazaPostId: postId,
        cursor: commentNextCursorMap[postId] || undefined,
        limit: 30,
      });
      const comments = page.comments || [];
      setCommentsByPostId((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), ...comments] }));
      setCommentCountMap((prev) => ({ ...prev, [postId]: Math.max(prev[postId] ?? 0, (prev[postId] || 0) + comments.length) }));
      setCommentHasMoreMap((prev) => ({ ...prev, [postId]: Boolean(page.hasMore) }));
      setCommentNextCursorMap((prev) => ({ ...prev, [postId]: page.nextCursor || null }));
    } finally {
      setCommentFetchingMoreMap((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const dismissRecommendationItem = async (item: Recommendation) => {
    if (!item.challengeId) return;

    const fallbackSuppressUntil = new Date(Date.now() + RECOMMENDATION_SUPPRESS_HOURS * 60 * 60 * 1000).toISOString();
    const dismissResult = await dismissRecommendation(item.id);
    const suppressUntil = dismissResult?.suppressUntil || fallbackSuppressUntil;

    const map = getDismissMap();
    map[item.challengeId] = suppressUntil;
    setDismissMap(map);

    setSelectedRecommendations((prev) => (prev ? prev.filter((r) => r.challengeId !== item.challengeId) : prev));
  };

  const toggleAnonymousMode = () => {
    setIsAnonymousMode((prev) => {
      const next = !prev;
      localStorage.setItem(ANONYMITY_STORAGE_KEY, String(next));
      return next;
    });
  };

  const filterCountMap: Record<PlazaFilter, number> = {
    all: posts.length,
    recruiting: posts.filter((p) => p.postType === 'recruitment').length,
    ongoing: posts.filter((p) => p.postType === 'progress_update').length,
    records: posts.filter((p) => p.postType === 'badge_review' || p.postType === 'courtyard').length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
        <h1 className="text-2xl font-bold text-gray-900">마당 (Outer Space)</h1>
        <p className="text-sm text-gray-600 mt-1">광장 피드 · 반익명 커뮤니티</p>
      </div>

      <div className="px-6 py-5 max-w-3xl mx-auto space-y-5">
        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">익명 활동명</h2>
              <p className="text-xs text-gray-500 mt-1">다음 적용일: {nextApplyDate} · 현재 활동명: {currentAlias}</p>
            </div>
            <button
              type="button"
              onClick={toggleAnonymousMode}
              className={`px-3 py-1.5 text-xs rounded-xl border ${isAnonymousMode ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300'}`}
            >
              익명 활동 {isAnonymousMode ? 'ON' : 'OFF'}
            </button>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="grid grid-cols-4 gap-2">
            {FILTER_TABS.map((tab) => {
              const active = plazaFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPlazaFilter(tab.key)}
                  className={`rounded-xl py-2 text-xs border ${active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-200'}`}
                >
                  {tab.label} ({filterCountMap[tab.key]})
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-3">
            {isLoading ? (
              <Loading />
            ) : isError ? (
              <EmptyState icon="⚠️" title="광장 피드를 불러오지 못했어요" description="잠시 후 다시 시도해주세요." />
            ) : posts.length === 0 ? (
              <EmptyState icon="🌌" title="아직 게시물이 없어요" description="곧 마당 게시물이 여기에 표시됩니다." />
            ) : posts.map((post) => (
              <motion.article
                key={post.plazaPostId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-gray-200 rounded-2xl p-4 bg-white"
              >
                <p className="text-[11px] font-semibold text-primary-700">
                  {post.postType === 'recruitment' && '카드 A · 챌린지 모집 공고'}
                  {post.postType === 'progress_update' && '카드 B · 진행 중 업데이트'}
                  {(post.postType === 'courtyard' || post.postType === 'badge_review') && '카드 C · 마당 게시물(익명)'}
                </p>

                <h3 className="mt-1 text-sm font-semibold text-gray-900">{post.challengeTitle || '챌린지'}</h3>
                <p className="mt-1 text-xs text-gray-500">{format(new Date(post.createdAt), 'M월 d일 HH:mm', { locale: ko })}</p>

                {post.leaderName && <p className="mt-1 text-xs text-gray-600">리더: {post.leaderName}</p>}
                {post.recruitMessage && <p className="mt-2 text-sm text-gray-700">{post.recruitMessage}</p>}
                {post.leaderMessage && <p className="mt-2 text-sm text-gray-700">{post.leaderMessage}</p>}
                {post.content && <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{post.content}</p>}

                {post.imageUrl && (
                  isVideoUrl(post.imageUrl)
                    ? <video src={resolveMediaUrl(post.imageUrl)} controls className="w-full h-44 object-cover rounded-xl mt-3 bg-black" />
                    : <img src={resolveMediaUrl(post.imageUrl)} alt="마당 인증" className="w-full h-44 object-cover rounded-xl mt-3" />
                )}

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void reactToPost(post);
                    }}
                    disabled={Boolean(reactingIds[post.plazaPostId])}
                    className="px-2.5 py-1 text-xs rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-50"
                  >
                    {reactingIds[post.plazaPostId] ? '저장 중...' : `❤️ ${reactionCountMap[post.plazaPostId] ?? post.likeCount ?? 0}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void toggleComments(post.plazaPostId);
                    }}
                    className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 bg-white text-gray-700"
                  >
                    💬 댓글 {commentCountMap[post.plazaPostId] ?? commentsByPostId[post.plazaPostId]?.length ?? post.commentCount ?? 0}
                  </button>
                  {post.challengeCategory && (
                    <span className="text-[11px] text-gray-500">#{post.challengeCategory}</span>
                  )}
                </div>

                {commentOpenMap[post.plazaPostId] && (
                  <div className="mt-3 rounded-xl border border-gray-200 p-3 bg-gray-50">
                    {commentLoadingMap[post.plazaPostId] ? (
                      <p className="text-xs text-gray-500">댓글 불러오는 중...</p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {(commentsByPostId[post.plazaPostId] || []).length === 0 ? (
                            <p className="text-xs text-gray-500">아직 댓글이 없어요.</p>
                          ) : (
                            (commentsByPostId[post.plazaPostId] || []).map((comment) => (
                              <div key={comment.commentId} className="text-xs text-gray-700">
                                <span className="font-medium mr-1">{comment.animalIcon} 익명</span>
                                <span>{comment.content}</span>
                                {comment.isMine && <span className="ml-1 text-primary-700">(내 댓글)</span>}
                              </div>
                            ))
                          )}
                        </div>
                        {commentHasMoreMap[post.plazaPostId] && (
                          <button
                            type="button"
                            onClick={() => {
                              void loadMoreComments(post.plazaPostId);
                            }}
                            disabled={Boolean(commentFetchingMoreMap[post.plazaPostId])}
                            className="mt-2 text-xs text-gray-600 underline disabled:opacity-50"
                          >
                            {commentFetchingMoreMap[post.plazaPostId] ? '댓글 불러오는 중...' : '댓글 더보기'}
                          </button>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            value={commentInputMap[post.plazaPostId] || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setCommentInputMap((prev) => ({ ...prev, [post.plazaPostId]: value }));
                            }}
                            placeholder="댓글 달기..."
                            className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-gray-200 bg-white"
                            maxLength={300}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              void submitComment(post.plazaPostId);
                            }}
                            disabled={Boolean(commentSubmittingMap[post.plazaPostId])}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-primary-200 bg-primary-50 text-primary-700 disabled:opacity-50"
                          >
                            {commentSubmittingMap[post.plazaPostId] ? '등록 중...' : '등록'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {(post.remainingSlots !== undefined || post.totalSlots !== undefined) && (
                  <p className="mt-2 text-xs text-gray-500">잔여 자리: {post.remainingSlots ?? 0} / {post.totalSlots ?? 0}</p>
                )}

                {post.challengeTitle && (
                  <Link to={post.challengeId ? `/challenges/${post.challengeId}` : "/challenges"} className="mt-2 inline-block text-xs text-primary-700 underline">
                    챌린지 보러가기
                  </Link>
                )}
              </motion.article>
            ))}

            {hasNextPage && (
              <button
                type="button"
                onClick={() => {
                  void fetchNextPage();
                }}
                disabled={isFetchingNextPage}
                className="w-full py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 disabled:opacity-50"
              >
                {isFetchingNextPage ? '불러오는 중...' : '게시물 더보기'}
              </button>
            )}
          </div>
        </section>

        {selectedRecommendations && selectedRecommendations.length > 0 && (
          <section className="bg-white border border-primary-200 rounded-2xl p-4">
            <h2 className="text-sm font-bold text-primary-700">관심 가질 만한 챌린지</h2>
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
