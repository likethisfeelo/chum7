import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useHashtagPage } from '../hooks/useHashtagPage';
import { usePlazaComments } from '@/features/feed/hooks/usePlazaComments';
import { VerificationCard } from '@/features/feed/components/VerificationCard';

export function HashtagPage() {
  const { tag } = useParams<{ tag: string }>();
  const navigate = useNavigate();
  const decoded = tag ? decodeURIComponent(tag) : '';

  const {
    meta,
    isMetaLoading,
    isMetaError,
    posts,
    isPostsLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    followed,
    isPendingFollow,
    toggleFollow,
  } = useHashtagPage(decoded);

  const initialCounts = Object.fromEntries(posts.map((p) => [p.plazaPostId, p.commentCount ?? 0]));
  const commentHook = usePlazaComments(initialCounts);

  if (isMetaLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (isMetaError || !meta) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 text-gray-500">
        <p className="text-sm">해쉬태그를 찾을 수 없어요.</p>
        <button type="button" onClick={() => navigate(-1)} className="text-xs text-primary-500 underline">
          뒤로 가기
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          aria-label="뒤로 가기"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-900">#{decoded}</h1>
      </div>

      {/* 메타 카드 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 mb-6 space-y-3">
        {/* 등록자 */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          {meta.creator ? (
            <>
              <span className="text-lg">{meta.creator.animalIcon}</span>
              <span>등록자 · {format(new Date(meta.registeredAt), 'yyyy.MM.dd', { locale: ko })}</span>
            </>
          ) : (
            <span>등록일 · {format(new Date(meta.registeredAt), 'yyyy.MM.dd', { locale: ko })}</span>
          )}
        </div>

        {/* 통계 */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>게시물 <strong className="text-gray-700">{meta.postCount}</strong>개</span>
          <span>팔로워 <strong className="text-gray-700">{meta.followerCount}</strong>명</span>
        </div>

        {/* 팔로우 버튼 */}
        <button
          type="button"
          onClick={toggleFollow}
          disabled={isPendingFollow}
          className={`w-full py-2 text-sm font-medium rounded-xl border transition-all disabled:opacity-50 ${
            followed
              ? 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {isPendingFollow ? '처리 중...' : followed ? '✓ 팔로우 중' : '+ 팔로우'}
        </button>
      </div>

      {/* 게시물 목록 */}
      <div className="space-y-4">
        {isPostsLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">아직 게시물이 없어요.</p>
        ) : (
          posts.map((post) => (
            <VerificationCard
              key={post.plazaPostId}
              post={post}
              likeCount={post.likeCount ?? 0}
              isReacting={false}
              commentCount={post.commentCount ?? 0}
              commentHook={commentHook}
              recommendations={[]}
              onReact={() => {}}
              onDismissRecommendation={() => {}}
              onUserHashtagClick={(ht) => navigate(`/hashtag/${encodeURIComponent(ht)}`)}
            />
          ))
        )}

        {hasNextPage && (
          <button
            type="button"
            onClick={() => { void fetchNextPage(); }}
            disabled={isFetchingNextPage}
            className="w-full py-2 text-sm text-gray-500 underline disabled:opacity-50"
          >
            {isFetchingNextPage ? '불러오는 중...' : '더 보기'}
          </button>
        )}
      </div>
    </div>
  );
}
