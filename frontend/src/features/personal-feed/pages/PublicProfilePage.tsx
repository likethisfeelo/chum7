import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { personalFeedApi, type LedChallengeCard } from '../api/personalFeedApi';
import { Loading } from '@/shared/components/Loading';
import { SLUG_TO_COLOR, SLUG_TO_LABEL } from '@/features/challenge/constants/categories';

/**
 * 공개 프로필 페이지 — /p/:handle (비로그인 열람 허용).
 *  리더가 모객용으로 공유하는 랜딩: 소개(bio) + 대표 게시물(최대 6) +
 *  리더/매니저로 여는 챌린지(모집중·진행중·진행했던) + 참여 버튼.
 *  주소는 @핸들만 사용(원본 userId 미노출 — 주소 래핑 정책).
 */

const LIFECYCLE_SECTION: { key: 'recruiting' | 'active' | 'past'; label: string; emoji: string }[] = [
  { key: 'recruiting', label: '모집 중인 챌린지', emoji: '📣' },
  { key: 'active', label: '진행 중인 챌린지', emoji: '🔥' },
  { key: 'past', label: '진행했던 챌린지', emoji: '🏁' },
];

function LedChallengeRow({ ch, onOpen }: { ch: LedChallengeCard; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center text-lg flex-shrink-0">
          {ch.badgeIcon || '🎯'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full ${SLUG_TO_COLOR[ch.category ?? ''] || 'bg-gray-100 text-gray-600'}`}
            >
              {SLUG_TO_LABEL[ch.category ?? ''] || ch.category}
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                ch.role === 'leader' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
              }`}
            >
              {ch.role === 'leader' ? '👑 리더' : '🤝 매니저'}
            </span>
          </div>
          <h3 className="mt-1 font-bold text-gray-900 text-sm leading-snug line-clamp-1">{ch.title}</h3>
          {ch.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ch.description}</p>
          )}
          <div className="flex items-center gap-2.5 mt-1.5 text-[11px] text-gray-500">
            {ch.durationDays && <span>📅 {ch.durationDays}일</span>}
            <span>👥 {ch.stats?.totalParticipants ?? 0}명</span>
            {ch.lifecycle === 'recruiting' && !ch.disbanded && (
              <span className="ml-auto text-primary-600 font-bold">참여하기 →</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export const PublicProfilePage = () => {
  const { handle: rawHandle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const handle = (rawHandle ?? '').startsWith('@') ? rawHandle! : `@${rawHandle ?? ''}`;

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['public-profile', handle],
    enabled: Boolean(rawHandle),
    retry: false,
    queryFn: () => personalFeedApi.getPublicProfile(handle),
  });

  const { data: ledData } = useQuery({
    queryKey: ['public-profile-led', handle],
    enabled: Boolean(rawHandle) && Boolean(profile),
    queryFn: () => personalFeedApi.getLedChallenges(handle),
  });

  const { data: featuredData } = useQuery({
    queryKey: ['public-profile-featured', handle],
    enabled: Boolean(rawHandle) && Boolean(profile?.publicProfile?.enabled),
    queryFn: () => personalFeedApi.getFeaturedVerifications(handle),
  });

  if (isLoading) return <Loading />;

  if (isError || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-4xl mb-4">🔍</p>
        <p className="text-base font-semibold text-gray-800 mb-2">프로필을 찾을 수 없어요</p>
        <p className="text-sm text-gray-500 mb-6">주소가 잘못되었거나 프로필이 비공개 상태예요.</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2 bg-primary-500 text-white rounded-full text-sm font-semibold"
        >
          CHUM7 홈으로
        </button>
      </div>
    );
  }

  const pub = profile.publicProfile;
  const featured = featuredData?.items ?? [];
  const led = ledData ?? { recruiting: [], active: [], past: [], total: 0 };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 헤더 카드 */}
      <div className="bg-white border-b border-gray-100 px-6 pt-10 pb-6 text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center text-4xl">
          {profile.animalIcon || '🐰'}
        </div>
        <h1 className="mt-3 text-xl font-bold text-gray-900">{profile.displayName}</h1>
        {profile.feedHandle && <p className="text-sm text-gray-400 mt-0.5">@{profile.feedHandle}</p>}
        {pub?.bio && (
          <p className="mt-3 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap max-w-md mx-auto">
            {pub.bio}
          </p>
        )}
        {profile.feedHandle && (
          <button
            type="button"
            onClick={() => {
              const url = `${window.location.origin}/p/@${profile.feedHandle}`;
              if (navigator.share) {
                navigator.share({ title: `CHUM7 — ${profile.displayName}`, url }).catch(() => undefined);
              } else {
                navigator.clipboard
                  .writeText(url)
                  .then(() => toast.success('프로필 링크를 복사했어요'))
                  .catch(() => toast.error('링크 복사에 실패했어요'));
              }
            }}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-colors"
          >
            🔗 프로필 링크 공유
          </button>
        )}
      </div>

      <div className="px-4 pt-5 max-w-xl mx-auto space-y-6">
        {/* 대표 게시물 */}
        {featured.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-gray-900 mb-2">✨ 대표 게시물</h2>
            <div className="grid grid-cols-3 gap-1.5">
              {featured.map((v, i) => (
                <motion.div
                  key={v.verificationId}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="relative aspect-[4/5] rounded-xl overflow-hidden bg-white border border-gray-100"
                >
                  {v.imageUrl ? (
                    <img src={v.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full p-2 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                      <p className="text-[11px] text-gray-600 line-clamp-5 leading-snug">
                        {v.todayNote || '📝'}
                      </p>
                    </div>
                  )}
                  {typeof v.day === 'number' && (
                    <span className="absolute top-1 left-1 text-[9px] font-bold bg-black/50 text-white px-1.5 py-0.5 rounded-full">
                      Day {v.day}
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* 리더/매니저 챌린지 섹션 */}
        {LIFECYCLE_SECTION.map(({ key, label, emoji }) => {
          const items = led[key];
          if (!items || items.length === 0) return null;
          return (
            <section key={key}>
              <h2 className="text-sm font-bold text-gray-900 mb-2">
                {emoji} {label}
                <span className="ml-1.5 text-xs font-medium text-gray-400">{items.length}개</span>
              </h2>
              <div className="space-y-2">
                {items.map((ch) => (
                  <LedChallengeRow
                    key={`${ch.role}-${ch.challengeId}`}
                    ch={ch}
                    onOpen={() => navigate(`/challenges/${ch.challengeId}`)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {led.total === 0 && featured.length === 0 && (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-400">
            아직 공개된 챌린지나 대표 게시물이 없어요.
          </div>
        )}
      </div>

      {/* 하단 고정 CTA */}
      <div className="fixed bottom-0 inset-x-0 z-20 p-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
        <div className="max-w-xl mx-auto">
          <button
            type="button"
            onClick={() =>
              navigate(
                led.recruiting.length > 0
                  ? `/challenges/${led.recruiting[0].challengeId}`
                  : '/challenges',
              )
            }
            className="w-full py-4 rounded-2xl bg-gray-900 text-white font-bold text-base shadow-lg hover:bg-gray-700 transition-colors"
          >
            {led.recruiting.length > 0 ? '모집 중인 챌린지 참여하기 →' : 'CHUM7 챌린지 둘러보기 →'}
          </button>
        </div>
      </div>
    </div>
  );
};
