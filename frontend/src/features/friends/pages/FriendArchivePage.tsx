import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { SkeletonRows } from '@/shared/components/Skeleton';
import {
  fetchArchiveItem,
  fetchArchiveTimeline,
  fetchRelationshipSummary,
  setArchiveConsent,
  sourceDeepLink,
} from '../api/friendsApi';

const TYPE_LABEL: Record<string, string> = {
  comment: '댓글',
  reply: '답글',
  reaction: '리액션',
  cheer: '응원',
  co_challenge: '함께 완주',
  plaza_meet: '마당에서 마주침',
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

export const FriendArchivePage = () => {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [timelineConsent, setTimelineConsent] = useState(false);
  const [fullContentConsent, setFullContentConsent] = useState(false);

  const summary = useQuery({
    queryKey: ['relationship-summary', userId],
    queryFn: () => fetchRelationshipSummary(userId),
    enabled: Boolean(userId),
  });

  // 저장된 내 동의값으로 체크박스 초기화
  useEffect(() => {
    if (summary.data) {
      setTimelineConsent(summary.data.myConsent.timeline);
      setFullContentConsent(summary.data.myConsent.fullContent);
    }
  }, [summary.data]);
  const timeline = useInfiniteQuery({
    queryKey: ['archive-timeline', userId],
    queryFn: ({ pageParam }) => fetchArchiveTimeline(userId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(userId),
    retry: false,
  });

  const consentM = useMutation({
    mutationFn: (patch: { timeline?: boolean; fullContent?: boolean }) =>
      setArchiveConsent(userId, patch),
    onSuccess: () => {
      toast.success('공개 설정을 저장했어요');
      qc.invalidateQueries({ queryKey: ['archive-timeline', userId] });
      qc.invalidateQueries({ queryKey: ['relationship-summary', userId] });
    },
    onError: () => toast.error('설정에 실패했어요'),
  });

  // 단계 E: 원본 보기 — 참조를 받아 기존 화면으로 딥링크. 플래그 off면 서버가 403.
  const openSource = async (interactionId: string, occurredAt: string) => {
    try {
      const ref = await fetchArchiveItem(userId, interactionId, occurredAt);
      const link = sourceDeepLink(ref);
      if (link) navigate(link);
      else toast('이 기록은 원본으로 이동할 화면이 없어요');
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === 'FEATURE_DISABLED') toast('원본 보기는 아직 제공되지 않아요');
      else if (code === 'CONTENT_UNAVAILABLE') toast('원본이 삭제되었거나 비공개예요');
      else toast.error('원본을 불러오지 못했어요');
    }
  };

  const s = summary.data;
  // 양쪽 전체 동의 시에만 "원본 보기" 노출(글로벌 플래그는 서버가 최종 판정)
  const fullContentReady =
    Boolean(s?.myConsent.fullContent) && Boolean(s?.counterpartConsent.fullContent);
  const timelineBlocked =
    (timeline.error as any)?.response?.data?.error === 'TIMELINE_CONSENT_REQUIRED';
  const entries = timeline.data?.pages.flatMap((p) => p.timeline) ?? [];

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <Link to="/friends" className="text-sm text-primary-600">← 친구</Link>
      <h1 className="text-2xl font-bold text-gray-900">우리의 기록</h1>

      {/* 요약 (친구면 자동) */}
      {s && (
        <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-1 text-sm text-gray-700">
          <p>함께 참여한 챌린지 <b>{s.sharedChallengeCount}</b>개</p>
          <p>서로 남긴 댓글 <b>{s.commentCount}</b>회 · 리액션 <b>{s.reactionCount}</b>회</p>
          <p>주고받은 응원 <b>{s.cheerCount}</b>회 · 마당에서 마주침 <b>{s.plazaMeetCount}</b>회</p>
          {s.firstInteractionAt && (
            <p className="text-gray-500 pt-1">처음 마주친 날: {fmtDate(s.firstInteractionAt)}</p>
          )}
        </section>
      )}

      {/* 타임라인 동의 */}
      <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
        <div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={timelineConsent}
              onChange={(e) => { setTimelineConsent(e.target.checked); consentM.mutate({ timeline: e.target.checked }); }}
            />
            우리 상호작용 타임라인 공개에 동의
          </label>
          <p className="text-xs text-gray-400 mt-1">
            양쪽 모두 동의해야 타임라인이 열려요. 과거 활동의 익명 표기는 그대로 유지돼요.
          </p>
          {s && (
            <p className="text-xs text-gray-400 mt-1">
              친구 동의: {s.counterpartConsent.timeline ? '✅ 동의함' : '⏳ 아직 동의 안 함'}
            </p>
          )}
        </div>

        {/* 단계 E: 전체 콘텐츠(원본 보기) 동의 — 타임라인 동의 이후 노출 */}
        {timelineConsent && (
          <div className="pt-3 border-t border-gray-100">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={fullContentConsent}
                onChange={(e) => { setFullContentConsent(e.target.checked); consentM.mutate({ fullContent: e.target.checked }); }}
              />
              원본 콘텐츠(원문·게시물) 열람에 동의
            </label>
            <p className="text-xs text-gray-400 mt-1">
              양쪽 모두 동의하면 각 기록에서 원본 화면으로 이동할 수 있어요.
            </p>
            {s && (
              <p className="text-xs text-gray-400 mt-1">
                친구 동의: {s.counterpartConsent.fullContent ? '✅ 동의함' : '⏳ 아직 동의 안 함'}
              </p>
            )}
          </div>
        )}
      </section>

      {/* 타임라인 (양쪽 동의 시) */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500">타임라인</h2>
        {timelineBlocked ? (
          <p className="text-sm text-gray-400">양쪽이 타임라인 공개에 동의하면 여기에 표시돼요.</p>
        ) : timeline.isLoading ? (
          <SkeletonRows count={3} />
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400">아직 기록이 없어요.</p>
        ) : (
          <>
            {entries.map((e) => (
              <div key={e.interactionId} className="bg-white rounded-xl border border-gray-200 p-3 text-sm flex items-center">
                <div className="flex-1 min-w-0">
                  <span className="text-gray-400 mr-2">{fmtDate(e.occurredAt)}</span>
                  <span className="text-gray-800">
                    {e.actorIsMine ? '내가' : '친구가'}
                    {!e.actorIsMine && e.actorDisplayName && (
                      <span className="text-gray-400"> [{e.actorDisplayName}]</span>
                    )}{' '}
                    {TYPE_LABEL[e.interactionType] ?? e.interactionType}
                  </span>
                  {e.contextType && <span className="text-gray-400"> · {e.contextType}</span>}
                </div>
                {fullContentReady && e.hasSource && (
                  <button
                    onClick={() => openSource(e.interactionId, e.occurredAt)}
                    className="shrink-0 ml-2 text-xs font-semibold text-primary-600 hover:text-primary-700"
                  >
                    원본 보기
                  </button>
                )}
              </div>
            ))}
            {timeline.hasNextPage && (
              <button
                onClick={() => timeline.fetchNextPage()}
                disabled={timeline.isFetchingNextPage}
                className="w-full py-2 text-sm font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-50"
              >
                {timeline.isFetchingNextPage ? '불러오는 중…' : '더 보기'}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
};
