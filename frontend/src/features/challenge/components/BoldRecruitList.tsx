import { useRef, useState } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';
import { SLUG_TO_HEX, SLUG_TO_EMOJI, SLUG_TO_LABEL } from '../constants/categories';

// 종이 패널 색 + 사진 seam으로 자연스럽게 녹아드는 사선 그라데이션(좌 종이 → 우 투명)
const PAPER = '#F4F0E7';
const PAPER_FADE = 'rgba(244,240,231,0)';
const SEAM_GRADIENT = `linear-gradient(100deg, ${PAPER} 0%, ${PAPER} 28%, ${PAPER_FADE} 100%)`;

// 레퍼런스(Charmi) 스타일의 컬러풀 대형 모집 카드 + 스크롤 무브 인터랙션 + 탭 시 전체화면 상세 확장.
// 색/이모지는 카테고리 상수 재사용(SLUG_TO_HEX/SLUG_TO_EMOJI).

export interface BoldChallenge {
  challengeId: string;
  title: string;
  description?: string;
  category: string;
  badgeName?: string;
  coverImageUrl?: string | null;
  durationDays?: number;
  challengeStartAt?: string;
  rewardPhysical?: { name: string } | null;
  rewardOnline?: { name: string } | null;
  stats?: { totalParticipants?: number; completionRate?: number };
}

function metricLabel(c: BoldChallenge): string {
  return c.durationDays ? `${c.durationDays}일간` : '매일';
}

function formatStartLabel(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function hasCompletionReward(c: BoldChallenge): boolean {
  return Boolean(c.rewardPhysical?.name || c.rewardOnline?.name);
}

// ── 카드 1장 (스크롤 진행도에 따라 살짝 스케일·캐릭터 패럴랙스) ──
function BoldRecruitCard({
  challenge,
  onOpen,
}: {
  challenge: BoldChallenge;
  onOpen: (c: BoldChallenge) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  // 화면 중앙에 올 때 1, 위/아래로 벗어날수록 약간 축소 → "무브" 느낌
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.93, 1, 0.93]);
  const charY = useTransform(scrollYProgress, [0, 1], [22, -22]);

  const hex = SLUG_TO_HEX[challenge.category] ?? '#6E7687';
  const emoji = SLUG_TO_EMOJI[challenge.category] ?? '✨';
  const cover = challenge.coverImageUrl ? resolveMediaUrl(challenge.coverImageUrl) : null;

  // ── 대표 이미지 있음: 종이가 사진으로 사선 그라데이션으로 녹아드는 스타일 ──
  if (cover) {
    return (
      <motion.button
        ref={ref}
        type="button"
        layoutId={`recruit-card-${challenge.challengeId}`}
        onClick={() => onOpen(challenge)}
        style={{ scale, backgroundColor: PAPER }}
        whileTap={{ scale: 0.97 }}
        className="relative w-full text-left rounded-[28px] overflow-hidden min-h-[180px] shadow-lg shadow-black/5"
      >
        {/* 우측 이미지 — 여백 없이 꽉 채움. 세로는 아래 정렬(위만 잘림), 가로는 가운데 기준 크롭 */}
        <div className="absolute inset-y-0 right-0 w-[54%] overflow-hidden">
          <img src={cover} alt="" className="w-full h-full object-cover object-bottom" />
          {/* 종이 → 사진 seam 페이드 */}
          <div className="absolute inset-y-0 left-0 w-1/2 z-[1]" style={{ background: SEAM_GRADIENT }} />
        </div>
        {/* 텍스트 */}
        <div className="relative z-10 p-5 w-[58%]">
          <span className="inline-block text-[10px] font-semibold text-gray-500 bg-black/5 rounded-full px-2 py-0.5 mb-1.5">
            {SLUG_TO_LABEL[challenge.category] ?? challenge.category}
          </span>
          <h3 className="font-serif font-bold text-gray-900 text-xl leading-tight">{challenge.title}</h3>
          {challenge.description && (
            <p className="mt-1.5 text-gray-500 text-xs leading-snug line-clamp-2">{challenge.description}</p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-gray-700 bg-black/5 rounded-full px-2 py-0.5">
              {metricLabel(challenge)}
            </span>
            <span className="text-[11px] text-gray-600 bg-black/5 rounded-full px-2 py-0.5">
              👥 {challenge.stats?.totalParticipants ?? 0}
            </span>
            {hasCompletionReward(challenge) && (
              <span className="text-[11px] font-bold text-gray-800 bg-amber-100 rounded-full px-2 py-0.5">🎁 완주보상</span>
            )}
          </div>
        </div>
      </motion.button>
    );
  }

  // ── 대표 이미지 없음: 카테고리 컬러 카드(캐릭터 이모지) ──
  return (
    <motion.button
      ref={ref}
      type="button"
      layoutId={`recruit-card-${challenge.challengeId}`}
      onClick={() => onOpen(challenge)}
      style={{ scale, backgroundColor: hex }}
      whileTap={{ scale: 0.97 }}
      className="relative w-full text-left rounded-[28px] overflow-hidden p-5 min-h-[172px] shadow-lg shadow-black/5"
    >
      {/* 부드러운 광택 오버레이 */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/10 pointer-events-none" />
      {/* 대형 캐릭터(카테고리 이모지) */}
      <motion.div
        style={{ y: charY }}
        className="absolute -right-3 -bottom-4 text-[112px] leading-none select-none opacity-90 drop-shadow-md"
      >
        {emoji}
      </motion.div>

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-white font-extrabold text-xl leading-tight drop-shadow-sm max-w-[68%]">
            {challenge.title}
          </h3>
          <span className="flex-shrink-0 text-white font-bold text-xs bg-black/20 rounded-full px-3 py-1.5 backdrop-blur-sm whitespace-nowrap">
            {metricLabel(challenge)}
          </span>
        </div>
        {challenge.description && (
          <p className="mt-2 text-white/90 text-sm leading-snug line-clamp-2 max-w-[70%] drop-shadow-sm">
            {challenge.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-white text-[11px] font-semibold bg-white/25 rounded-full px-2.5 py-1">
            {SLUG_TO_LABEL[challenge.category] ?? challenge.category}
          </span>
          <span className="text-white text-[11px] bg-white/25 rounded-full px-2.5 py-1">
            👥 {challenge.stats?.totalParticipants ?? 0}
          </span>
          {hasCompletionReward(challenge) && (
            <span className="text-[11px] font-bold bg-white text-gray-800 rounded-full px-2.5 py-1">
              🎁 완주보상
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ── 전체화면 상세(퀵뷰) — 카드에서 확장 ──
function ChallengeQuickView({
  challenge,
  onClose,
  onViewDetail,
}: {
  challenge: BoldChallenge;
  onClose: () => void;
  onViewDetail: (id: string) => void;
}) {
  const hex = SLUG_TO_HEX[challenge.category] ?? '#6E7687';
  const emoji = SLUG_TO_EMOJI[challenge.category] ?? '✨';
  const cover = challenge.coverImageUrl ? resolveMediaUrl(challenge.coverImageUrl) : null;

  return (
    <motion.div
      className="fixed inset-0 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* 배경 */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* 카드가 전체화면으로 확장 (layoutId 공유) */}
      <motion.div
        layoutId={`recruit-card-${challenge.challengeId}`}
        className="absolute inset-0 flex flex-col overflow-y-auto"
        style={{ backgroundColor: cover ? PAPER : hex }}
      >
        {!cover && (
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/25 pointer-events-none" />
        )}

        {/* 닫기 버튼 */}
        <div className="absolute top-0 right-0 z-20 p-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {cover ? (
          // ── 대표 이미지 히어로: 상단 사진 + 제목 오버레이 ──
          <div className="relative z-10">
            <div className="relative h-72">
              <img src={cover} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute bottom-4 left-6 right-6">
                <span className="text-white text-xs font-semibold bg-white/25 rounded-full px-3 py-1.5">
                  {SLUG_TO_LABEL[challenge.category] ?? challenge.category}
                </span>
                <h2 className="mt-2 text-white font-extrabold text-3xl leading-tight drop-shadow">
                  {challenge.title}
                </h2>
              </div>
            </div>
            <div className="px-6 pt-4 flex flex-wrap gap-2">
              <span className="text-gray-700 text-sm font-semibold bg-black/5 rounded-full px-3 py-1.5">
                ⏳ {metricLabel(challenge)}
              </span>
              <span className="text-gray-600 text-sm bg-black/5 rounded-full px-3 py-1.5">
                👥 {challenge.stats?.totalParticipants ?? 0}명
              </span>
              <span className="text-gray-600 text-sm bg-black/5 rounded-full px-3 py-1.5">
                ✅ {challenge.stats?.completionRate ?? 0}%
              </span>
            </div>
          </div>
        ) : (
          // ── 이미지 없음: 카테고리 컬러 + 캐릭터 이모지 ──
          <div className="relative z-10 px-6 pt-16">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 20 }}
              className="text-[128px] leading-none drop-shadow-lg"
            >
              {emoji}
            </motion.div>
            <h2 className="mt-3 text-white font-extrabold text-3xl leading-tight drop-shadow">
              {challenge.title}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-white text-sm font-semibold bg-white/25 rounded-full px-3 py-1.5">
                ⏳ {metricLabel(challenge)}
              </span>
              <span className="text-white text-sm bg-white/25 rounded-full px-3 py-1.5">
                👥 {challenge.stats?.totalParticipants ?? 0}명
              </span>
              <span className="text-white text-sm bg-white/25 rounded-full px-3 py-1.5">
                ✅ {challenge.stats?.completionRate ?? 0}%
              </span>
            </div>
          </div>
        )}

        {/* 본문 카드 */}
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.12 }}
          className="relative z-10 mt-6 flex-1 rounded-t-[32px] bg-white px-6 pt-6 pb-28"
        >
          {/* 일정 — 시작일/기간 (참여 전 확인용, 보상 위) */}
          <div className="flex items-center gap-2.5 rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3">
            <span className="text-lg">📅</span>
            <p className="text-sm font-semibold text-gray-800">
              {formatStartLabel(challenge.challengeStartAt)
                ? `${formatStartLabel(challenge.challengeStartAt)}부터 `
                : ''}
              {challenge.durationDays ? `${challenge.durationDays}일간` : '매일'} 진행
            </p>
          </div>

          {/* 완주 보상 */}
          {(challenge.rewardPhysical?.name || challenge.rewardOnline?.name || challenge.badgeName) && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-gray-900 mb-2">완주 보상</h3>
              <div className="space-y-2">
                {challenge.badgeName && (
                  <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                    <span className="text-lg">🏅</span>
                    <p className="text-sm font-semibold text-gray-800">{challenge.badgeName} 배지</p>
                  </div>
                )}
                {challenge.rewardPhysical?.name && (
                  <div className="flex items-center gap-2.5 bg-amber-50 rounded-xl px-3 py-2.5 border border-amber-100">
                    <span className="text-lg">📦</span>
                    <p className="text-sm font-semibold text-gray-800">{challenge.rewardPhysical.name}</p>
                  </div>
                )}
                {challenge.rewardOnline?.name && (
                  <div className="flex items-center gap-2.5 bg-rose-50 rounded-xl px-3 py-2.5 border border-rose-100">
                    <span className="text-lg">🎁</span>
                    <p className="text-sm font-semibold text-gray-800">{challenge.rewardOnline.name}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 챌린지 소개 — 맨 아래 */}
          {challenge.description && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-gray-900 mb-2">챌린지 소개</h3>
              <p className="text-gray-700 text-[15px] leading-relaxed whitespace-pre-wrap">
                {challenge.description}
              </p>
            </div>
          )}
        </motion.div>

        {/* 하단 고정 CTA */}
        <div className="fixed bottom-0 inset-x-0 z-20 p-4 bg-gradient-to-t from-white via-white to-transparent">
          <button
            type="button"
            onClick={() => onViewDetail(challenge.challengeId)}
            className="w-full py-4 rounded-2xl text-white font-bold text-base shadow-lg"
            style={{ backgroundColor: hex }}
          >
            자세히 보고 참여하기 →
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── 리스트 컨테이너 (선택 상태 관리) ──
export function BoldRecruitList({
  challenges,
  onNavigate,
}: {
  challenges: BoldChallenge[];
  onNavigate: (id: string) => void;
}) {
  const [selected, setSelected] = useState<BoldChallenge | null>(null);

  return (
    <>
      <div className="space-y-4">
        {challenges.map((c) => (
          <BoldRecruitCard key={c.challengeId} challenge={c} onOpen={setSelected} />
        ))}
      </div>

      <AnimatePresence>
        {selected && (
          <ChallengeQuickView
            key={selected.challengeId}
            challenge={selected}
            onClose={() => setSelected(null)}
            onViewDetail={(id) => {
              setSelected(null);
              onNavigate(id);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
