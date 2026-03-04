import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { EmptyState } from '@/shared/components/EmptyState';

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

const PHASE_SCOPE = [
  {
    phase: 'Phase 1',
    title: '반익명 커뮤니티 기초',
    feature: '익명 활동명 ON/OFF + 주기별 활동명 전환 구조',
    detail: '기본은 닉네임 공개, 익명 ON 시 다음 주부터 랜덤 활동명을 사용해 챌린지 안에서 반익명으로 활동합니다.',
  },
  {
    phase: 'Phase 1',
    title: '챌린지 리더 시스템 기초',
    feature: '리더 피드 + 모집 공고 카드(A)',
    detail: '공개 리더는 브랜드명으로 모집 공고를 올리고, 익명 리더는 노하우 중심으로 챌린지를 운영할 수 있습니다.',
  },
  {
    phase: 'Phase 1',
    title: '광장 피드 MVP',
    feature: '카드 A(모집 공고) 중심 노출',
    detail: '광장에서 모집 공고를 발견하고 리더 피드 → 참여까지 연결되는 기본 동선을 먼저 제공합니다.',
  },
  {
    phase: 'Phase 2+',
    title: '마당 자동 변환 & 고도화',
    feature: '카드 B/C + 반응 기반 추천',
    detail: '다음날 익명 변환 게시물(카드 C), 진행 중 업데이트(카드 B), 추천 알고리즘은 커뮤니티 단계에서 확장합니다.',
  },
];

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

const ANONYMOUS_NAMES = ['새벽의 곰', '조용한 호랑이', '집중하는 올빼미', '묵묵한 이무기'];

export const FeedPage = () => {
  const [plazaFilter, setPlazaFilter] = useState<PlazaFilter>('all');
  const [isAnonymousMode, setIsAnonymousMode] = useState(false);

  const currentAlias = useMemo(() => ANONYMOUS_NAMES[new Date().getMonth() % ANONYMOUS_NAMES.length], []);

  const filteredRecruitCards = useMemo(() => {
    if (plazaFilter === 'ongoing' || plazaFilter === 'records') return [];
    return RECRUIT_CARDS;
  }, [plazaFilter]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
        <h1 className="text-2xl font-bold text-gray-900">마당 (Outer Space) 🚀</h1>
        <p className="text-sm text-gray-500">리더 모집과 반익명 커뮤니티를 연결하는 공개 광장</p>
      </div>

      <div className="px-6 py-6 space-y-4">
        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900">1) 반익명 활동명 설정 (선개발)</h2>
              <p className="text-xs text-gray-600 mt-1">토글 변경은 다음 주부터 적용되고, 진행 중 챌린지는 유지됩니다.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAnonymousMode((prev) => !prev)}
              className={`px-3 py-1.5 text-xs rounded-full border ${isAnonymousMode ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              익명 활동 {isAnonymousMode ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="mt-3 text-xs text-gray-600 space-y-1">
            <p>• 현재 노출 방식: {isAnonymousMode ? `동물 아이콘 + 활동명 (${currentAlias})` : '기본 닉네임 공개'}</p>
            <p>• 다음 주 적용 예정 상태를 저장해 챌린지 단위 일관성을 유지합니다.</p>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-2">5) 챌린지 리더 시스템 (선개발)</h2>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• 리더 피드 기본 구조: 모집 공고 / 리더 프로필 / 커리큘럼 소개</li>
            <li>• 공개 리더 챌린지: 리더명 공개 + 팬 기반 모집</li>
            <li>• 익명 리더 챌린지: 동물 아이콘 기반 동등 소통</li>
          </ul>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">6) 광장 피드 MVP (카드 A 우선)</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { key: 'all', label: '전체' },
              { key: 'recruiting', label: '모집 중' },
              { key: 'ongoing', label: '진행 중' },
              { key: 'records', label: '완주 기록' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPlazaFilter(tab.key as PlazaFilter)}
                className={`px-3 py-1.5 text-xs rounded-full border ${plazaFilter === tab.key ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredRecruitCards.length === 0 ? (
              <EmptyState icon="🛰️" title="다음 페이즈에서 확장돼요" description="진행 중/완주 기록 카드는 Phase 2에서 추가됩니다." />
            ) : (
              filteredRecruitCards.map((card, index) => (
                <motion.article
                  key={card.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="border border-gray-200 rounded-2xl p-4"
                >
                  <h3 className="font-semibold text-gray-900">{card.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    리더: {card.leaderName}
                    {card.leaderVisibility === 'public' ? ' 👑' : ' 🐻'} · 시작일: {card.startDate}
                  </p>
                  <p className="text-xs text-primary-700 mt-1">잔여: {card.seatsLeft}자리 / {card.seatsTotal}자리</p>
                  <p className="text-sm text-gray-700 mt-2">“{card.summary}”</p>
                  <button type="button" className="mt-3 px-3 py-2 text-xs rounded-xl bg-gray-900 text-white">
                    참여하기
                  </button>
                </motion.article>
              ))
            )}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-2">개발 페이즈 제안</h2>
          <div className="space-y-2">
            {PHASE_SCOPE.map((item) => (
              <div key={`${item.phase}-${item.title}`} className="rounded-xl bg-gray-50 p-3">
                <p className="text-[11px] font-semibold text-primary-700">{item.phase} · {item.title}</p>
                <p className="text-xs text-gray-700 mt-1">{item.feature}</p>
                <p className="text-xs text-gray-500 mt-1">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
