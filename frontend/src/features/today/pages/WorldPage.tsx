import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { worldApi, WorldLayer } from '../api/worldApi';
import { Loading } from '@/shared/components/Loading';

// ── 카테고리별 테마 ────────────────────────────────────────────────────
const LAYER_THEME: Record<string, {
  bg: string;       // CSS gradient (어두운 상태)
  bright: string;   // CSS gradient (밝은 상태)
  accent: string;   // hex — cheer 정령 색
  jelly: string;    // hex — thanks 젤리 색
  emoji: string;
}> = {
  health:       { bg: 'from-rose-950 to-rose-900',      bright: 'from-rose-700 to-rose-500',      accent: '#fb7185', jelly: '#fda4af', emoji: '💗' },
  mindfulness:  { bg: 'from-amber-950 to-amber-900',    bright: 'from-amber-600 to-amber-400',    accent: '#fbbf24', jelly: '#fde68a', emoji: '🔥' },
  habit:        { bg: 'from-yellow-950 to-orange-900',  bright: 'from-yellow-600 to-orange-500',  accent: '#facc15', jelly: '#fef08a', emoji: '⚡' },
  relationship: { bg: 'from-indigo-950 to-indigo-900',  bright: 'from-indigo-600 to-blue-500',    accent: '#818cf8', jelly: '#c7d2fe', emoji: '🏗️' },
  creativity:   { bg: 'from-teal-950 to-teal-900',      bright: 'from-teal-600 to-cyan-500',      accent: '#2dd4bf', jelly: '#99f6e4', emoji: '🧭' },
  development:  { bg: 'from-blue-950 to-blue-900',      bright: 'from-blue-600 to-indigo-500',    accent: '#60a5fa', jelly: '#bfdbfe', emoji: '🎨' },
  expand:       { bg: 'from-purple-950 to-purple-900',  bright: 'from-purple-600 to-violet-500',  accent: '#a78bfa', jelly: '#ddd6fe', emoji: '🌱' },
  impact:       { bg: 'from-emerald-950 to-green-900',  bright: 'from-emerald-600 to-green-500',  accent: '#34d399', jelly: '#a7f3d0', emoji: '🚀' },
};

// ── 창조물 개체 (정령 / 젤리) ───────────────────────────────────────
interface Creature {
  id: string;
  x: number;   // % 0-100
  y: number;   // % 0-100
  size: number;
  delay: number;
  isNew: boolean;
}

function buildCreatures(score: number, todayDelta: number, prefix: string): Creature[] {
  if (score <= 0) return [];
  const count = Math.min(40, Math.ceil(score / 3));
  // seeded pseudo-random so positions are stable across renders
  const creatures: Creature[] = [];
  let seed = score * 137 + prefix.charCodeAt(0);
  const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
  const newCount = Math.min(todayDelta * 2, count);
  for (let i = 0; i < count; i++) {
    creatures.push({
      id: `${prefix}-${i}`,
      x: 5 + rand() * 90,
      y: 10 + rand() * 80,
      size: 0.5 + rand() * 1,
      delay: rand() * 3,
      isNew: i < newCount,
    });
  }
  return creatures;
}

// ── 정령형 (cheer) ───────────────────────────────────────────────────
function SpiritCreature({ c, color }: { c: Creature; color: string }) {
  return (
    <motion.div
      key={c.id}
      className="absolute rounded-full pointer-events-none"
      style={{
        left: `${c.x}%`,
        top:  `${c.y}%`,
        width:  `${c.size * 6}px`,
        height: `${c.size * 6}px`,
        backgroundColor: color,
        boxShadow: `0 0 ${c.size * 4}px ${color}`,
        opacity: 0.85,
      }}
      animate={{
        y: [0, -8, 0, 4, 0],
        x: [0, 3, -3, 2, 0],
        opacity: c.isNew ? [0, 1, 0.85] : [0.6, 0.9, 0.6],
        scale: c.isNew ? [0.5, 1.3, 1] : [1, 1.1, 1],
      }}
      transition={{
        duration: 3 + c.delay,
        repeat: Infinity,
        delay: c.delay,
        ease: 'easeInOut',
      }}
    />
  );
}

// ── 젤리형 (thanks) ──────────────────────────────────────────────────
function JellyCreature({ c, color }: { c: Creature; color: string }) {
  return (
    <motion.div
      key={c.id}
      className="absolute rounded-full pointer-events-none"
      style={{
        left: `${c.x}%`,
        top:  `${c.y}%`,
        width:  `${c.size * 10}px`,
        height: `${c.size * 10}px`,
        backgroundColor: color,
        boxShadow: `0 0 ${c.size * 6}px ${color}80`,
        opacity: 0.7,
      }}
      animate={{
        scale: c.isNew ? [0.3, 1.2, 1] : [1, 1.08, 1],
        opacity: c.isNew ? [0, 0.8, 0.7] : [0.5, 0.75, 0.5],
        y: [0, -3, 0],
      }}
      transition={{
        duration: 4 + c.delay * 0.5,
        repeat: Infinity,
        delay: c.delay * 0.8,
        ease: 'easeInOut',
      }}
    />
  );
}

// ── 단일 레이어 카드 ─────────────────────────────────────────────────
function WorldLayerCard({ layer, index }: { layer: WorldLayer; index: number }) {
  const theme = LAYER_THEME[layer.category];
  const revealRatio = layer.questScore / 100;

  const spirits = buildCreatures(layer.cheerScore, 0, `sp-${layer.category}`);
  const jellies = buildCreatures(layer.thankScore, 0, `jl-${layer.category}`);

  const isUnderground = layer.floor.startsWith('B');

  return (
    <motion.div
      className="relative overflow-hidden"
      style={{ height: 140 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4 }}
    >
      {/* Base: 어두운 배경 */}
      <div className={`absolute inset-0 bg-gradient-to-r ${theme.bg}`} />

      {/* Discover: questScore에 따라 밝아지는 레이어 */}
      <motion.div
        className={`absolute inset-0 bg-gradient-to-r ${theme.bright}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: revealRatio * 0.65 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />

      {/* 지하층 균열/암석 텍스처 힌트 */}
      {isUnderground && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(0,0,0,0.3) 20px, rgba(0,0,0,0.3) 21px)',
          }}
        />
      )}

      {/* 오늘 quest 증가 shimmer */}
      {layer.todayQuestDelta > 0 && (
        <motion.div
          className="absolute inset-0 bg-white pointer-events-none"
          animate={{ opacity: [0, 0.12, 0, 0.08, 0] }}
          transition={{ duration: 2, repeat: 3, repeatDelay: 1 }}
        />
      )}

      {/* 생명체 레이어 */}
      <div className="absolute inset-0">
        {spirits.map(c => (
          <SpiritCreature key={c.id} c={c} color={theme.accent} />
        ))}
        {jellies.map(c => (
          <JellyCreature key={c.id} c={c} color={theme.jelly} />
        ))}
      </div>

      {/* 텍스트 오버레이 */}
      <div className="absolute inset-0 flex items-center px-5">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* 층 배지 */}
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-black/30 flex flex-col items-center justify-center backdrop-blur-sm">
            <span className="text-white/50 text-[9px] font-bold leading-none">{layer.floor}</span>
            <span className="text-base leading-none mt-0.5">{theme.emoji}</span>
          </div>

          {/* 이름 + 점수 */}
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight truncate">{layer.label}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {/* Quest 진행 바 */}
              <div className="w-20 h-1.5 bg-black/30 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white/70 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${layer.questScore}%` }}
                  transition={{ duration: 1, ease: 'easeOut', delay: index * 0.07 }}
                />
              </div>
              <span className="text-white/60 text-[10px] font-mono">{layer.questScore}</span>
            </div>
          </div>
        </div>

        {/* 오른쪽 생명체 수 요약 */}
        <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
          {layer.cheerScore > 0 && (
            <span className="text-[10px] text-white/60">
              ✦ {layer.cheerScore}
            </span>
          )}
          {layer.thankScore > 0 && (
            <span className="text-[10px] text-white/50">
              ● {layer.thankScore}
            </span>
          )}
          {layer.todayQuestDelta > 0 && (
            <motion.span
              className="text-[10px] font-bold"
              style={{ color: theme.accent }}
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              +{layer.todayQuestDelta} 오늘
            </motion.span>
          )}
        </div>
      </div>

      {/* 층 구분선 */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-black/40" />
    </motion.div>
  );
}

// ── 도움말 모달 ──────────────────────────────────────────────────────
function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/50" />
        <motion.div
          className="relative w-full bg-white rounded-t-2xl p-6 pb-10 space-y-3"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30 }}
          onClick={e => e.stopPropagation()}
        >
          <h3 className="text-base font-bold text-gray-800 mb-4">월드 점수 안내</h3>
          {[
            ['8개 층', '각 층은 하나의 챌린지 주제입니다'],
            ['퀘스트 점수 (0–100)', '해당 주제의 인증 완료 수. 100개 완료 시 지도 완전 공개'],
            ['✦ 응원 점수', '응원 받은 점수 — 정령형 생명체로 표현됩니다'],
            ['● 감사 점수', '감사 받은 점수 — 젤리형 생명체로 표현됩니다'],
            ['+N 오늘', '오늘 새롭게 완료한 인증 수 (KST 기준)'],
          ].map(([title, desc]) => (
            <div key={title} className="flex gap-3">
              <span className="text-sm font-semibold text-gray-700 w-28 flex-shrink-0">{title}</span>
              <span className="text-sm text-gray-500">{desc}</span>
            </div>
          ))}
          <button
            onClick={onClose}
            className="mt-4 w-full py-3 bg-gray-100 text-gray-700 text-sm font-semibold rounded-2xl"
          >
            닫기
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
export function WorldPage() {
  const [showHelp, setShowHelp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['world-summary'],
    queryFn: worldApi.getSummary,
    staleTime: 60_000,
  });

  // 지상층(G1~G6)이 위, 지하(B2~B1)가 아래 — 아래에서 위로 쌓이는 순서
  // 원하는 시각: G6(Impact) 맨 위, B2(health) 맨 아래
  const ordered = data ? [...data.layers].reverse() : [];

  useEffect(() => {
    // 처음 진입 시 스크롤을 아래(B2)로 이동
    if (scrollRef.current && data) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data]);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-gray-950">
        <div>
          <h2 className="text-white font-bold text-lg leading-tight">월드</h2>
          {data && (
            <p className="text-gray-400 text-xs mt-0.5">
              퀘스트 {data.totals.questScore} · ✦{data.totals.cheerScore} · ●{data.totals.thankScore}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowHelp(true)}
          className="w-8 h-8 rounded-full bg-white/10 text-white/60 text-sm flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          ?
        </button>
      </div>

      {/* 층 목록 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loading />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm">데이터를 불러올 수 없어요</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* G6~B2 순서로 렌더 (위→아래 = Impact→Health) */}
            {ordered.map((layer, i) => (
              <WorldLayerCard key={layer.category} layer={layer} index={i} />
            ))}
          </div>
        )}
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
