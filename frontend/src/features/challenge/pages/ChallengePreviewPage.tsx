import { useMemo } from 'react';
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';
import { SLUG_TO_LABEL, SLUG_TO_EMOJI, SLUG_TO_HEX, DEFAULT_BANNERS } from '@/features/challenge/constants/categories';
import { getChallengeTypeLabel } from '@/features/challenge/utils/flowPolicy';

/**
 * 공개 챌린지 미리보기 — 로그인 전에도 열리는 공유 링크 랜딩(/preview/:challengeId).
 *  - 인증 없이 /public/challenges/:id (+/stats) 로 정보를 보여주고, 참여는 로그인으로 유도한다.
 *  - 이미 로그인한 사용자는 실제 상세(/challenges/:id)로 즉시 이동.
 */
const LIFECYCLE_META: Record<string, { label: string; cls: string }> = {
  recruiting: { label: '모집중', cls: 'bg-emerald-100 text-emerald-700' },
  preparing: { label: '준비중', cls: 'bg-amber-100 text-amber-700' },
  active: { label: '진행중', cls: 'bg-blue-100 text-blue-700' },
  completed: { label: '종료', cls: 'bg-gray-100 text-gray-500' },
  archived: { label: '보관됨', cls: 'bg-gray-100 text-gray-500' },
  draft: { label: '준비중', cls: 'bg-gray-100 text-gray-500' },
};

const VERIFICATION_LABEL: Record<string, string> = {
  image: '📸 사진',
  video: '🎬 영상',
  link: '🔗 링크',
  text: '📝 텍스트',
};

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function ChallengePreviewPage() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: challenge, isLoading, isError } = useQuery({
    queryKey: ['public-challenge-preview', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => (await apiClient.get(`/public/challenges/${challengeId}`)).data.data,
  });

  const detailPath = `/challenges/${challengeId}`;
  const loginTarget = `/login?redirect=${encodeURIComponent(detailPath)}`;

  const lifecycle: string = challenge?.effectiveLifecycle || challenge?.lifecycle || 'recruiting';
  const isRecruiting = lifecycle === 'recruiting';
  const category = challenge?.category as string | undefined;

  const heroColor = category ? SLUG_TO_HEX[category] ?? '#6E7687' : '#6E7687';
  const banner = category ? DEFAULT_BANNERS[category] : undefined;

  const facts = useMemo(() => {
    if (!challenge) return [] as Array<{ label: string; value: string }>;
    const out: Array<{ label: string; value: string }> = [];
    if (challenge.durationDays) out.push({ label: '기간', value: `${challenge.durationDays}일` });
    const participants = challenge.participantCount ?? challenge.stats?.totalParticipants ?? 0;
    out.push({ label: '참여자', value: `${participants}명` });
    if (challenge.challengeType) out.push({ label: '유형', value: getChallengeTypeLabel(challenge.challengeType) });
    if (Array.isArray(challenge.allowedVerificationTypes) && challenge.allowedVerificationTypes.length) {
      out.push({
        label: '인증',
        value: challenge.allowedVerificationTypes.map((t: string) => VERIFICATION_LABEL[t] ?? t).join(' · '),
      });
    }
    const recruitEnd = formatDate(challenge.recruitingEndAt);
    if (isRecruiting && recruitEnd) out.push({ label: '모집 마감', value: recruitEnd });
    const startAt = formatDate(challenge.challengeStartAt);
    if (startAt) out.push({ label: '시작', value: startAt });
    return out;
  }, [challenge, isRecruiting]);

  // 로그인 상태면 실제 상세로 (미리보기는 로그인 전 전용)
  if (isAuthenticated && challengeId) {
    return <Navigate to={detailPath} replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary-50 to-white">
        <p className="text-sm text-gray-500">불러오는 중…</p>
      </div>
    );
  }

  if (isError || !challenge) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-primary-50 to-white px-6 text-center">
        <p className="text-3xl">🔍</p>
        <p className="text-sm font-semibold text-gray-700">챌린지를 찾을 수 없어요</p>
        <p className="text-xs text-gray-500">삭제되었거나 링크가 올바르지 않을 수 있어요.</p>
        <Link to="/" className="mt-2 text-sm font-semibold text-primary-600">chum7 둘러보기 →</Link>
      </div>
    );
  }

  const cover = challenge.coverImageUrl ? resolveMediaUrl(challenge.coverImageUrl) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      {/* 상단 바 */}
      <header className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto w-full">
        <Link to="/" className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-xs">ME</span>
          <span className="font-bold text-gray-900">chum7</span>
        </Link>
        <Link to={loginTarget} className="text-sm font-semibold text-primary-600">로그인</Link>
      </header>

      <div className="max-w-lg mx-auto w-full px-4 pb-28">
        {/* 히어로 — 커버 있으면 이미지, 없으면 카테고리 그라디언트 */}
        <div className="rounded-3xl overflow-hidden shadow-sm">
          {cover ? (
            <img src={cover} alt={challenge.title} className="w-full h-56 object-cover" />
          ) : (
            <div
              className="w-full h-56 flex flex-col items-center justify-center text-white"
              style={{ background: `linear-gradient(135deg, ${heroColor}, ${heroColor}cc)` }}
            >
              <span className="text-5xl mb-2">{(category && SLUG_TO_EMOJI[category]) || '🔥'}</span>
              {banner && <p className="text-sm font-medium opacity-90 px-6 text-center">{banner.tagline}</p>}
            </div>
          )}
        </div>

        {/* 배지들 */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${LIFECYCLE_META[lifecycle]?.cls ?? 'bg-gray-100 text-gray-500'}`}>
            {LIFECYCLE_META[lifecycle]?.label ?? lifecycle}
          </span>
          {category && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: `${heroColor}1a`, color: heroColor }}
            >
              {(SLUG_TO_EMOJI[category] || '') + ' ' + (SLUG_TO_LABEL[category] ?? category)}
            </span>
          )}
        </div>

        {/* 제목 */}
        <h1 className="text-2xl font-bold text-gray-900 mt-3 leading-snug">{challenge.title}</h1>

        {/* 설명 */}
        {challenge.description && (
          <p className="text-sm text-gray-600 leading-relaxed mt-3 whitespace-pre-wrap">{challenge.description}</p>
        )}

        {/* 핵심 정보 */}
        {facts.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-5">
            {facts.map((f) => (
              <div key={f.label} className="rounded-xl bg-white border border-gray-100 px-3 py-2.5">
                <p className="text-[11px] text-gray-400">{f.label}</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5">{f.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* 보상 뱃지 */}
        {(challenge.badgeName || challenge.badgeIcon) && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-white border border-gray-100 px-4 py-3">
            <span className="text-2xl">{challenge.badgeIcon || '🏅'}</span>
            <div>
              <p className="text-[11px] text-gray-400">완주 뱃지</p>
              <p className="text-sm font-semibold text-gray-800">{challenge.badgeName || '완주 뱃지'}</p>
            </div>
          </div>
        )}

        {/* 안내 */}
        <p className="text-xs text-gray-400 text-center mt-6">
          chum7은 7일 챌린지로 습관을 함께 만드는 서비스예요.
        </p>
      </div>

      {/* 하단 고정 CTA */}
      <div className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur border-t border-gray-100 p-4">
        <div className="max-w-lg mx-auto w-full space-y-2">
          <button
            type="button"
            onClick={() => navigate(loginTarget)}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold text-base shadow-sm"
          >
            {isRecruiting ? '로그인하고 참여하기' : '로그인하고 자세히 보기'}
          </button>
          <p className="text-center text-xs text-gray-500">
            계정이 없으신가요?{' '}
            <Link to={`/register?redirect=${encodeURIComponent(detailPath)}`} className="font-semibold text-primary-600">
              회원가입
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
