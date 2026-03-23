import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { Loading } from '@/shared/components/Loading';
import { personalFeedApi, FeedAchievements } from '../api/personalFeedApi';

type FeedTab = 'verifications' | 'challenges' | 'achievements' | 'posts';

const TAB_CONFIG: { key: FeedTab; label: string; num: string }[] = [
  { key: 'verifications', label: '인증', num: '01' },
  { key: 'challenges', label: '챌린지', num: '02' },
  { key: 'achievements', label: '업적', num: '03' },
  { key: 'posts', label: '자유', num: '04' },
];

const BADGE_META: Record<string, { icon: string; name: string; desc: string }> = {
  '3-day-streak': { icon: '🔥', name: '3일 연속', desc: '3일 연속 퀘스트 완료' },
  '7-day-master': { icon: '⭐', name: '7일 마스터', desc: '7일 연속 퀘스트 완료' },
};

function AchievementsTab({ achievements }: { achievements: FeedAchievements }) {
  return (
    <div className="space-y-4 pb-20">
      {/* 스코어 & 활동 통계 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">활동 통계</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-primary-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-primary-700">
              {achievements.verifications.totalScore.toLocaleString()}
            </p>
            <p className="text-xs text-primary-500 mt-0.5">누적 스코어</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-700">
              {achievements.verifications.total}
            </p>
            <p className="text-xs text-green-500 mt-0.5">총 인증 횟수</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">
              {achievements.challenges.completed}
            </p>
            <p className="text-xs text-blue-500 mt-0.5">챌린지 완주</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-700">
              {achievements.challenges.total}
            </p>
            <p className="text-xs text-orange-500 mt-0.5">총 참여 챌린지</p>
          </div>
        </div>
      </div>

      {/* 응원 통계 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">응원</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 bg-pink-50 rounded-xl p-3">
            <span className="text-2xl">💌</span>
            <div>
              <p className="text-lg font-bold text-pink-700">{achievements.cheers.receivedCount}</p>
              <p className="text-xs text-pink-400">받은 응원</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-purple-50 rounded-xl p-3">
            <span className="text-2xl">📣</span>
            <div>
              <p className="text-lg font-bold text-purple-700">{achievements.cheers.sentCount}</p>
              <p className="text-xs text-purple-400">보낸 응원</p>
            </div>
          </div>
        </div>
      </div>

      {/* 뱃지 */}
      {achievements.badges.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">
            획득 뱃지 ({achievements.badges.length})
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {achievements.badges.map((badge) => {
              const meta = BADGE_META[badge.badgeId] || { icon: '🏅', name: badge.badgeId, desc: '' };
              return (
                <div key={badge.badgeId + badge.grantedAt} className="flex flex-col items-center gap-1 bg-gray-50 rounded-xl p-3">
                  <span className="text-3xl">{meta.icon}</span>
                  <p className="text-xs font-semibold text-gray-700 text-center">{meta.name}</p>
                  <p className="text-[10px] text-gray-400 text-center">{meta.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {achievements.badges.length === 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
          <p className="text-4xl mb-2">🏅</p>
          <p className="text-sm font-semibold text-gray-700">아직 획득한 뱃지가 없어요</p>
          <p className="text-xs text-gray-400 mt-1">퀘스트를 완료하면 뱃지를 획득할 수 있어요</p>
        </div>
      )}
    </div>
  );
}

function ComingSoonTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-4xl mb-3">🚧</p>
      <p className="text-base font-semibold text-gray-700">{label} 탭</p>
      <p className="text-sm text-gray-400 mt-1">Phase 2에서 구현 예정이에요</p>
    </div>
  );
}

export function PersonalFeedPage() {
  const { userId: userIdParam } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<FeedTab>('achievements');

  const resolvedUserId = userIdParam === 'me' ? 'me' : (userIdParam ?? 'me');
  const isOwnFeed = userIdParam === 'me';

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['personal-feed-profile', resolvedUserId],
    queryFn: () => personalFeedApi.getProfile(resolvedUserId),
  });

  const { data: achievements, isLoading: achievementsLoading } = useQuery({
    queryKey: ['personal-feed-achievements', resolvedUserId],
    queryFn: () => personalFeedApi.getAchievements(resolvedUserId),
    enabled: activeTab === 'achievements',
  });

  const displayName = profile?.displayName ?? (isOwnFeed ? (user?.name ?? '나') : '...');
  const displayIcon = profile?.animalIcon ?? (isOwnFeed ? (user?.animalIcon ?? '🐰') : '🐰');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-primary-500 to-primary-700 pt-12 pb-6 px-6">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="text-white/80 hover:text-white text-xl"
          >
            ←
          </button>
          <span className="text-white/80 text-sm">개인 피드</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-3xl flex-shrink-0">
            {displayIcon}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-xl truncate">{displayName}</h1>
            {isOwnFeed && profile && (
              <p className="text-white/60 text-xs mt-0.5">
                {profile.feedSettings.isPublic ? '🌍 공개 중' : '🔒 비공개'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-xs font-semibold transition-colors relative ${
                activeTab === tab.key ? 'text-primary-600' : 'text-gray-400'
              }`}
            >
              <span className="text-[10px] opacity-60">{tab.num}</span>
              <br />
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 컨텐츠 */}
      <div className="p-4">
        {activeTab === 'achievements' && (
          achievementsLoading || profileLoading ? (
            <Loading />
          ) : achievements ? (
            <AchievementsTab achievements={achievements} />
          ) : (
            <ComingSoonTab label="시스템 업적" />
          )
        )}
        {activeTab === 'verifications' && <ComingSoonTab label="챌린지 인증 게시물" />}
        {activeTab === 'challenges' && <ComingSoonTab label="참여한 챌린지 목록" />}
        {activeTab === 'posts' && <ComingSoonTab label="자유 게시물" />}
      </div>
    </div>
  );
}
