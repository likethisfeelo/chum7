import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { Loading } from '@/shared/components/Loading';
import { characterApi } from '@/features/character/api/characterApi';
import { personalFeedApi, FeedAchievements } from '@/features/personal-feed/api/personalFeedApi';
import { apiClient } from '@/lib/api-client';
import { resolveChallengeBucket, getChallengeDisplayMeta } from '@/features/challenge/utils/challengeLifecycle';

type MyTab = 'character' | 'challenges' | 'badges';

const TAB_CONFIG: { key: MyTab; label: string }[] = [
  { key: 'character', label: '캐릭터' },
  { key: 'challenges', label: '챌린지' },
  { key: 'badges', label: '뱃지' },
];

const BADGE_META: Record<string, { icon: string; name: string; desc: string }> = {
  '3-day-streak': { icon: '🔥', name: '3일 연속', desc: '3일 연속 퀘스트 완료' },
  '7-day-master': { icon: '⭐', name: '7일 마스터', desc: '7일 연속 퀘스트 완료' },
};

const LEADER_BADGE_META: Record<string, { icon: string; name: string; desc: string }> = {
  'leader-debut': { icon: '🎖️', name: '리더 데뷔', desc: '챌린지 1회 이상 완료 운영' },
  'leader-active': { icon: '🏆', name: '활동 리더', desc: '완주율 50%+ 챌린지 3회 이상' },
  'leader-expert': { icon: '👑', name: '전문 리더', desc: '누적 참여자 50명 이상' },
  'leader-streak': { icon: '🔗', name: '연속 리더', desc: '3개월 이상 연속 챌린지 개설' },
};

const MYTHOLOGY_META = {
  korean: {
    emoji: '🐻', label: '한국 신화', color: '#5A8A3C',
    desc: '단군신화의 웅녀부터 이무기, 봉황까지 — 인내와 변화의 신화',
    characters: ['웅녀', '이무기', '도깨비', '호랑이', '봉황'],
  },
  greek: {
    emoji: '⚡', label: '그리스 신화', color: '#C9A227',
    desc: '올림포스의 신들, 영웅들의 이야기 — 도전과 지혜의 신화',
    characters: ['헤라클레스', '아테나', '아폴론', '아르테미스', '포세이돈'],
  },
  norse: {
    emoji: '🌩️', label: '북유럽 신화', color: '#5B8CA6',
    desc: '오딘과 토르, 발키리의 세계 — 용기와 운명의 신화',
    characters: ['오딘', '토르', '발키리', '프레이', '로키'],
  },
} as const;

const THEMES = [
  { theme: '', label: '기본', color: '#FF9B71' },
  { theme: 'korean', label: '한국', color: '#5A8A3C' },
  { theme: 'greek', label: '그리스', color: '#C9A227' },
  { theme: 'norse', label: '북유럽', color: '#5B8CA6' },
] as const;

// ─── 캐릭터 탭 ──────────────────────────────────────────────────────
function CharacterTab() {
  const navigate = useNavigate();
  const [currentTheme, setCurrentTheme] = useState(
    () => document.body.getAttribute('data-theme') ?? '',
  );

  const { data: characterStatus } = useQuery({
    queryKey: ['character', 'status'],
    queryFn: () => characterApi.getStatus(),
    staleTime: 60 * 1000,
  });

  const applyTheme = (theme: string) => {
    document.body.setAttribute('data-theme', theme);
    setCurrentTheme(theme);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* 캐릭터 카드 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">나의 캐릭터</h3>
        {!characterStatus ? (
          <Loading />
        ) : !characterStatus.onboardingDone ? (
          <button
            onClick={() => navigate('/character/onboarding')}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-primary-50 to-primary-100 border border-primary-200 text-left"
          >
            <span className="text-2xl">✨</span>
            <div className="flex-1">
              <div className="font-semibold text-gray-900 text-sm">나의 첫 캐릭터 선택하기</div>
              <div className="text-xs text-gray-500 mt-0.5">세계관을 선택하고 캐릭터를 완성해요</div>
            </div>
            <span className="text-gray-400 text-lg">→</span>
          </button>
        ) : characterStatus.activeCharacter ? (
          <button
            onClick={() => navigate('/character/viewer')}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-primary-50 to-indigo-50 border border-primary-200 shadow-sm text-left"
          >
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-2xl flex-shrink-0">
              {MYTHOLOGY_META[characterStatus.activeCharacter.mythologyLine as keyof typeof MYTHOLOGY_META]?.emoji ?? '🌟'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 text-base truncate">
                {characterStatus.activeCharacter.characterType}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {characterStatus.activeCharacter.filledCount}/{characterStatus.activeCharacter.totalSlots} 조각 완성
              </div>
              <div className="flex gap-0.5 mt-2">
                {Array.from({ length: characterStatus.activeCharacter.totalSlots }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 flex-1 rounded-full ${
                      i < characterStatus.activeCharacter!.filledCount
                        ? 'bg-primary-400'
                        : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
            </div>
            <span className="text-gray-400 text-lg flex-shrink-0">→</span>
          </button>
        ) : null}
      </div>

      {/* 테마 선택 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">테마</h3>
        <div className="flex gap-2 flex-wrap">
          {THEMES.map(({ theme, label, color }) => (
            <button
              key={theme || 'default'}
              onClick={() => applyTheme(theme)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                currentTheme === theme
                  ? 'text-white border-transparent shadow-sm'
                  : 'text-gray-600 border-gray-200 bg-white hover:bg-gray-50'
              }`}
              style={currentTheme === theme ? { backgroundColor: color, borderColor: color } : {}}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 캐릭터 세계관 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">캐릭터 세계관</h3>
        <div className="space-y-3">
          {(Object.entries(MYTHOLOGY_META) as [string, typeof MYTHOLOGY_META[keyof typeof MYTHOLOGY_META]][]).map(([key, meta]) => {
            const isActive = characterStatus?.activeMythology === key;
            const isCompleted = characterStatus?.completedMythologies?.includes(key as any);
            return (
              <div
                key={key}
                className={`rounded-xl p-3 border ${isActive ? 'border-primary-200 bg-primary-50' : 'border-gray-100 bg-gray-50'}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-lg">{meta.emoji}</span>
                  <span className="text-sm font-semibold text-gray-800">{meta.label}</span>
                  {isCompleted && <span className="ml-auto text-xs text-green-600 font-semibold">완성 ✓</span>}
                  {isActive && !isCompleted && <span className="ml-auto text-xs text-primary-600 font-semibold">진행 중</span>}
                </div>
                <p className="text-xs text-gray-500 mb-2">{meta.desc}</p>
                <div className="flex flex-wrap gap-1">
                  {meta.characters.map((c) => (
                    <span key={c} className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── 챌린지 탭 ────────────────────────────────────────────────────
type ChallengeBucketFilter = 'active' | 'preparing' | 'completed' | 'gave_up';

const BUCKET_META: Record<ChallengeBucketFilter, { label: string; color: string; bg: string; activeBg: string }> = {
  active:    { label: '진행중',  color: 'text-blue-700',  bg: 'bg-blue-50',   activeBg: 'bg-blue-500' },
  preparing: { label: '준비중',  color: 'text-yellow-700', bg: 'bg-yellow-50', activeBg: 'bg-yellow-500' },
  completed: { label: '완주',   color: 'text-green-700', bg: 'bg-green-50',  activeBg: 'bg-green-500' },
  gave_up:   { label: '포기',   color: 'text-gray-500',  bg: 'bg-gray-50',   activeBg: 'bg-gray-400' },
};

function ChallengesTab() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ChallengeBucketFilter>('active');

  const { data, isLoading } = useQuery({
    queryKey: ['my-challenges', 'all'],
    queryFn: async () => {
      const res = await apiClient.get('/challenges/my?status=all');
      return res.data.data;
    },
  });

  const items: any[] = data?.challenges ?? [];

  const summary = useMemo(() => ({
    active:    items.filter((i) => resolveChallengeBucket(i) === 'active').length,
    preparing: items.filter((i) => resolveChallengeBucket(i) === 'preparing').length,
    completed: items.filter((i) => resolveChallengeBucket(i) === 'completed').length,
    gave_up:   items.filter((i) => resolveChallengeBucket(i) === 'gave_up').length,
  }), [items]);

  const filtered = useMemo(
    () => items.filter((i) => resolveChallengeBucket(i) === filter),
    [items, filter],
  );

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-4 pb-24">
      {/* 요약 그리드 */}
      <div className="grid grid-cols-4 gap-2">
        {(Object.keys(BUCKET_META) as ChallengeBucketFilter[]).map((key) => {
          const meta = BUCKET_META[key];
          const isSelected = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-xl p-3 text-center transition-all ${
                isSelected ? `${meta.activeBg} text-white shadow-sm` : `${meta.bg} ${meta.color}`
              }`}
            >
              <p className={`text-xl font-bold ${isSelected ? 'text-white' : ''}`}>
                {summary[key]}
              </p>
              <p className={`text-[11px] mt-0.5 ${isSelected ? 'text-white/80' : ''}`}>
                {meta.label}
              </p>
            </button>
          );
        })}
      </div>

      {/* 챌린지 목록 */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <p className="text-3xl mb-2">🎯</p>
          <p className="text-sm font-semibold text-gray-700">
            {BUCKET_META[filter].label} 챌린지가 없어요
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item: any) => {
            const meta = getChallengeDisplayMeta(item);
            const bucket = resolveChallengeBucket(item);
            const bMeta = BUCKET_META[bucket as ChallengeBucketFilter] ?? BUCKET_META.active;
            const progressPct = meta.durationDays > 0
              ? Math.round((meta.participatedDays / meta.durationDays) * 100)
              : 0;
            const title = item.challenge?.title ?? item.title ?? '챌린지';
            const category = item.challenge?.challengeCategory ?? item.challenge?.category ?? '';

            return (
              <button
                key={item.userChallengeId ?? item.challengeId}
                onClick={() => navigate(`/challenges/${item.challengeId ?? item.challenge?.challengeId}`)}
                className="w-full bg-white rounded-2xl shadow-sm p-4 text-left"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-800 text-sm line-clamp-1">{title}</p>
                    {category && (
                      <p className="text-xs text-gray-400 mt-0.5">{category}</p>
                    )}
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${bMeta.bg} ${bMeta.color}`}>
                    {bMeta.label}
                  </span>
                </div>
                <div className="mb-1">
                  <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                    <span>Day {meta.currentDay} / {meta.durationDays}일</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 뱃지 탭 ──────────────────────────────────────────────────────
function BadgesTab({ achievements }: { achievements: FeedAchievements }) {
  return (
    <div className="space-y-4 pb-24">
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

      {achievements.badges.length > 0 ? (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">
            획득 뱃지 ({achievements.badges.length})
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {achievements.badges.map((badge) => {
              const meta = BADGE_META[badge.badgeId] ?? { icon: '🏅', name: badge.badgeId, desc: '' };
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
      ) : (
        <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
          <p className="text-4xl mb-2">🏅</p>
          <p className="text-sm font-semibold text-gray-700">아직 획득한 뱃지가 없어요</p>
          <p className="text-xs text-gray-400 mt-1">퀘스트를 완료하면 뱃지를 획득할 수 있어요</p>
        </div>
      )}

      {/* 리더 이력 블록 */}
      {achievements.leaderHistory.total > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">👑</span>
            <h3 className="text-sm font-semibold text-gray-700">리더 이력</h3>
          </div>

          {achievements.leaderBadges.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {achievements.leaderBadges.map((badge) => {
                const meta = LEADER_BADGE_META[badge.badgeId] ?? { icon: '🎖️', name: badge.badgeId, desc: '' };
                return (
                  <div key={badge.badgeId} className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1">
                    <span className="text-sm">{meta.icon}</span>
                    <span className="text-xs font-semibold text-yellow-700">{meta.name}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-amber-700">{achievements.leaderHistory.total}</p>
              <p className="text-[11px] text-amber-500">총 개설</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-green-700">{achievements.leaderHistory.completed}</p>
              <p className="text-[11px] text-green-500">완료 운영</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-blue-700">{achievements.leaderHistory.totalParticipants}</p>
              <p className="text-[11px] text-blue-500">누적 참여자</p>
            </div>
          </div>

          {achievements.leaderHistory.recentChallenges.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-400 mb-2">최근 운영 챌린지</p>
              {achievements.leaderHistory.recentChallenges.map((c) => (
                <div key={c.challengeId} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <p className="text-sm font-medium text-gray-700 line-clamp-1 flex-1 min-w-0 pr-2">
                    {c.title}
                  </p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400">{c.participantCount}명</span>
                    <span className="text-[11px] text-green-600 font-semibold">완료</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 메인 ──────────────────────────────────────────────────────────
export function MyPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<MyTab>('character');

  const { data: achievements, isLoading: achievementsLoading } = useQuery({
    queryKey: ['personal-feed-achievements', 'me'],
    queryFn: () => personalFeedApi.getAchievements('me'),
  });

  const topLeaderBadge = achievements?.leaderBadges?.[0];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-primary-500 to-primary-700 pt-12 pb-6 px-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-white font-bold text-lg">마이</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/personal-feed/notifications')}
              className="text-white/70 hover:text-white text-sm px-3 py-1 rounded-full border border-white/20 hover:border-white/40 transition-colors"
            >
              알림
            </button>
            <button
              onClick={() => navigate('/personal-feed/settings')}
              className="text-white/70 hover:text-white text-sm px-3 py-1 rounded-full border border-white/20 hover:border-white/40 transition-colors"
            >
              설정
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-3xl flex-shrink-0">
            {user?.animalIcon ?? '🐰'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-white font-bold text-xl truncate">{user?.name ?? '나'}</h2>
              {topLeaderBadge && (
                <span className="text-lg flex-shrink-0" title={LEADER_BADGE_META[topLeaderBadge.badgeId]?.name}>
                  {LEADER_BADGE_META[topLeaderBadge.badgeId]?.icon ?? '👑'}
                </span>
              )}
            </div>
            <p className="text-white/60 text-xs mt-0.5">Lv.{user?.level ?? 1}</p>
          </div>
          <button
            onClick={() => navigate('/personal-feed/me')}
            className="text-white/70 hover:text-white text-xs px-3 py-1.5 rounded-full border border-white/20 hover:border-white/40 transition-colors flex-shrink-0"
          >
            프로필피드 →
          </button>
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
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="my-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 컨텐츠 */}
      <div className="p-4">
        {activeTab === 'character' && <CharacterTab />}
        {activeTab === 'challenges' && <ChallengesTab />}
        {activeTab === 'badges' && (
          achievementsLoading || !achievements ? (
            <Loading />
          ) : (
            <BadgesTab achievements={achievements} />
          )
        )}
      </div>
    </div>
  );
}
