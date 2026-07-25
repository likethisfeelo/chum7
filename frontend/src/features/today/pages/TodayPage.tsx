import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { format, isToday } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { worldApi, WorldLayer } from '../api/worldApi';
import { buildCreatures, SpiritCreature, JellyCreature } from './WorldPage';
import { DEFAULT_BANNERS, SLUG_TO_EMOJI } from '@/features/challenge/constants/categories';

const REACTION_OPTIONS = ['❤️', '🔥', '👏'] as const;

// ── 월드 5개 영역 ─────────────────────────────────────────────────────
interface WorldArea {
  key: string;
  name: string;    // 표시 이름 (영문)
  slug: string;    // worldApi 카테고리 슬러그
  color: string;   // 메인 색
  jelly: string;   // 밝은 젤리 색
}

const WORLD_AREAS: WorldArea[] = [
  { key: 'confidence', name: 'CONFIDENCE', slug: 'expand',      color: '#7BAA7A', jelly: '#BEDBBD' },
  { key: 'attitude',   name: 'ATTITUDE',   slug: 'mindfulness', color: '#E39A69', jelly: '#F3CDB4' },
  { key: 'selflove',   name: 'SELFLOVE',   slug: 'health',      color: '#D46A6A', jelly: '#EBB4B4' },
  { key: 'discipline', name: 'DISCIPLINE', slug: 'habit',       color: '#D8B36A', jelly: '#ECD9B4' },
  { key: 'create',     name: 'CREATE',     slug: 'creativity',  color: '#9D8CCF', jelly: '#CEC5E7' },
];
const DEFAULT_AREA_INDEX = 2; // SELFLOVE

// hex 색을 검정과 섞어 어둡게
function shade(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c * (1 - amount));
  const to2 = (c: number) => c.toString(16).padStart(2, '0');
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}
// hex 색을 흰색과 섞어 밝게
function tint(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const to2 = (c: number) => c.toString(16).padStart(2, '0');
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

// ── SVG 달/행성 ───────────────────────────────────────────────────────
function Moon({ area }: { area: WorldArea }) {
  const light = tint(area.color, 0.45);
  const dark = shade(area.color, 0.28);
  const crater = shade(area.color, 0.14);
  const gid = `moon-grad-${area.key}`;
  const glow = `moon-glow-${area.key}`;
  return (
    <AnimatePresence mode="wait">
      <motion.svg
        key={area.key}
        width="180"
        height="180"
        viewBox="0 0 180 180"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <defs>
          <radialGradient id={gid} cx="38%" cy="34%" r="75%">
            <stop offset="0%" stopColor={light} />
            <stop offset="55%" stopColor={area.color} />
            <stop offset="100%" stopColor={dark} />
          </radialGradient>
          <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        {/* 후광 */}
        <circle cx="90" cy="90" r="70" fill={area.color} opacity="0.28" filter={`url(#${glow})`} />
        {/* 본체 */}
        <circle cx="90" cy="90" r="66" fill={`url(#${gid})`} />
        {/* 크레이터 */}
        <ellipse cx="112" cy="66" rx="13" ry="11" fill={crater} opacity="0.5" />
        <ellipse cx="70" cy="108" rx="17" ry="15" fill={crater} opacity="0.4" />
        <ellipse cx="118" cy="112" rx="8" ry="7" fill={crater} opacity="0.45" />
        <ellipse cx="64" cy="70" rx="6" ry="5" fill={crater} opacity="0.4" />
        {/* 하이라이트 */}
        <circle cx="66" cy="60" r="16" fill="#ffffff" opacity="0.18" />
      </motion.svg>
    </AnimatePresence>
  );
}

// ── 반원 회전 휠 ──────────────────────────────────────────────────────
const WHEEL_SPACING = 21;  // 노드 간 각도(도) — 5개가 모두 보이도록 좁게
const WHEEL_R = 215;       // 반지름(px) — 화면 폭 안에 5개 수용
const WHEEL_BASE_TOP = 58; // 선택(정점) 노드 top — 바깥 노드는 위로 올라감(위로 휜 호)

// 노드 뒤에 깔리는 얇은 회색 호(실선) — 노드와 동일한 파라미터로 그려 항상 정렬됨
const WHEEL_SVG_W = 360;
const WHEEL_SVG_H = 128;
const WHEEL_CENTER_Y = WHEEL_BASE_TOP + 26; // 선택 노드 중심 y
const WHEEL_ARC_PATH = (() => {
  const pts: string[] = [];
  for (let deg = -48; deg <= 48; deg += 2) {
    const r = (deg * Math.PI) / 180;
    const x = WHEEL_SVG_W / 2 + WHEEL_R * Math.sin(r);
    const y = WHEEL_CENTER_Y - WHEEL_R * (1 - Math.cos(r));
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return 'M' + pts.join(' L');
})();

function WorldWheel({
  selectedIndex,
  onSelect,
}: {
  selectedIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="relative w-full" style={{ height: 128 }}>
      {/* 뒤에 깔리는 얇은 회색 호(실선) */}
      <svg
        className="absolute left-1/2 top-0 -translate-x-1/2 pointer-events-none"
        width={WHEEL_SVG_W}
        height={WHEEL_SVG_H}
        viewBox={`0 0 ${WHEEL_SVG_W} ${WHEEL_SVG_H}`}
        style={{ zIndex: 0 }}
      >
        <path d={WHEEL_ARC_PATH} fill="none" stroke="#D6D6DB" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
      {WORLD_AREAS.map((area, i) => {
        const a = ((i - selectedIndex) * WHEEL_SPACING * Math.PI) / 180; // rad
        const dx = WHEEL_R * Math.sin(a);
        const rise = WHEEL_R * (1 - Math.cos(a)); // 바깥일수록 위로 상승(위로 휜 호)
        const isSel = i === selectedIndex;
        const scale = isSel ? 1.15 : 0.82;
        return (
          <motion.button
            key={area.key}
            onClick={() => onSelect(i)}
            className="absolute z-10 flex items-center justify-center rounded-full"
            style={{ left: 'calc(50% - 26px)', top: WHEEL_BASE_TOP }}
            animate={{
              x: dx,
              y: -rise,
              scale,
              opacity: 1,
            }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          >
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: 52,
                height: 52,
                background: isSel ? area.color : tint(area.color, 0.72),
                boxShadow: isSel
                  ? `0 6px 18px ${area.color}66`
                  : '0 2px 6px rgba(0,0,0,0.06)',
                border: isSel ? '2px solid #fff' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: 22 }}>{SLUG_TO_EMOJI[area.slug]}</span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ── 젤리 정원 (선택 영역 인라인 펼침) ─────────────────────────────────
function JellyGarden({ area, layer }: { area: WorldArea; layer?: WorldLayer }) {
  const spirits = buildCreatures(layer?.cheerScore ?? 0, 0, `sp-${area.slug}`);
  const jellies = buildCreatures(layer?.thankScore ?? 0, 0, `jl-${area.slug}`);
  const questScore = layer?.questScore ?? 0;
  return (
    <div
      className="relative overflow-hidden rounded-3xl"
      style={{
        height: 200,
        background: `linear-gradient(160deg, ${tint(area.color, 0.55)}, ${tint(area.color, 0.15)})`,
      }}
    >
      {spirits.map((c) => (
        <SpiritCreature key={c.id} c={c} color={area.color} />
      ))}
      {jellies.map((c) => (
        <JellyCreature key={c.id} c={c} color={area.jelly} />
      ))}
      <div className="absolute left-0 right-0 bottom-0 p-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="tab-mono text-white/90">QUEST {questScore}/100</span>
          <span className="tab-mono text-white/80">
            ✦{layer?.cheerScore ?? 0} · ●{layer?.thankScore ?? 0}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/30 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: shade(area.color, 0.1) }}
            initial={{ width: 0 }}
            animate={{ width: `${questScore}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  );
}

// ── 응원 폴더(서랍) ───────────────────────────────────────────────────
function CheerDrawer({
  open,
  onClose,
  received,
  sent,
  reactionMutation,
}: {
  open: boolean;
  onClose: () => void;
  received: any[];
  sent: any[];
  reactionMutation: any;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const list = tab === 'received' ? received : sent;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/40" />
          <motion.div
            className="relative w-full bg-white rounded-t-3xl h-[85vh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 핸들 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            {/* 헤더 */}
            <div className="px-5 pt-1 pb-3">
              <h3 className="text-base font-bold text-gray-900">오늘의 응원</h3>
            </div>
            {/* 탭 */}
            <div className="relative flex px-5 gap-5 border-b border-gray-100">
              {(['received', 'sent'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`relative pb-2 tab-mono ${
                    tab === t ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {t === 'received' ? '받은 응원' : '보낸 응원'}
                  {tab === t && (
                    <motion.div
                      layoutId="cheer-drawer-underline"
                      className="absolute left-0 right-0 -bottom-px h-0.5 bg-gray-900"
                    />
                  )}
                </button>
              ))}
            </div>
            {/* 목록 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
              {list.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-10">
                  {tab === 'received' ? '아직 받은 응원이 없어요' : '아직 보낸 응원이 없어요'}
                </p>
              ) : (
                list.map((cheer: any) => {
                  const senderName = cheer.senderAlias || '익명의 응원자';
                  const msg =
                    cheer.message ||
                    (cheer.delta ? `${cheer.delta}분 일찍 인증하고 응원을 보냈어요 💪` : '응원을 보냈어요 💪');
                  return (
                    <div
                      key={cheer.cheerId}
                      className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100"
                    >
                      {tab === 'received' && (
                        <p className="text-xs font-semibold text-gray-700 mb-0.5">{senderName}</p>
                      )}
                      <p className="text-sm text-gray-700 leading-relaxed">{msg}</p>
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        {format(new Date(cheer.sentAt || cheer.createdAt), 'MM/dd HH:mm', { locale: ko })}
                      </p>
                      {tab === 'received' && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {cheer.reactionType ? (
                            <span className="px-2 py-1 text-xs rounded-lg bg-emerald-50 text-emerald-700">
                              리액션 {cheer.reactionType}
                            </span>
                          ) : (
                            REACTION_OPTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() =>
                                  reactionMutation.mutate({ cheerId: cheer.cheerId, reactionType: emoji })
                                }
                                className="px-2 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200"
                                disabled={reactionMutation.isPending}
                              >
                                {emoji}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {/* 전체 이력 링크 */}
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => navigate('/personal-feed/me')}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                프로필에서 전체 이력 확인 →
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────
export const TodayPage = () => {
  const queryClient = useQueryClient();
  const [selectedIndex, setSelectedIndex] = useState(DEFAULT_AREA_INDEX);
  const [gardenOpen, setGardenOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const area = WORLD_AREAS[selectedIndex];

  const { data: worldData } = useQuery({
    queryKey: ['world-summary'],
    queryFn: worldApi.getSummary,
    staleTime: 60_000,
  });

  const { data: cheers } = useQuery({
    queryKey: ['my-cheers', 'received'],
    queryFn: async () => {
      const res = await apiClient.get('/ch/cheers/my?type=received&limit=20');
      return res.data.data.cheers;
    },
  });

  const { data: sentCheers } = useQuery({
    queryKey: ['my-cheers', 'sent'],
    queryFn: async () => {
      const res = await apiClient.get('/ch/cheers/my?type=sent&limit=20');
      return res.data.data.cheers;
    },
  });

  const reactionMutation = useMutation({
    mutationFn: async ({ cheerId, reactionType }: { cheerId: string; reactionType: string }) => {
      const res = await apiClient.post(`/ch/cheers/${cheerId}/reaction`, { reactionType });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-cheers'] });
      toast.success('리액션을 보냈어요');
    },
    onError: () => toast.error('리액션 전송 중 오류가 발생했습니다'),
  });

  const deliveredReceived = useMemo(
    () => (cheers || []).filter((c: any) => c.status === 'sent'),
    [cheers],
  );
  const normalSent = useMemo(
    () => (sentCheers || []).filter((c: any) => c.status === 'sent'),
    [sentCheers],
  );
  const todayReceivedCount = useMemo(
    () => deliveredReceived.filter((c: any) => isToday(new Date(c.sentAt || c.createdAt))).length,
    [deliveredReceived],
  );

  const layer = useMemo(
    () => worldData?.layers.find((l) => l.category === area.slug),
    [worldData, area.slug],
  );

  return (
    <div
      className="relative flex flex-col bg-white overflow-hidden"
      style={{ minHeight: 'calc(100vh - 64px)' }}
    >
      <div className="flex-1 flex flex-col items-center px-6 pt-0 pb-28">
        {/* 달 — 상단에 반원만 노출 (위로 올려 클리핑) */}
        <div className="w-full flex justify-center overflow-hidden" style={{ height: 92 }}>
          <div style={{ marginTop: -88 }}>
            <Moon area={area} />
          </div>
        </div>

        {/* 영역 이름 + 설명 */}
        <div className="text-center mt-5 min-h-[64px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={area.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              <h1
                className="text-2xl font-bold tracking-wide"
                style={{ color: shade(area.color, 0.15) }}
              >
                {area.name}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {DEFAULT_BANNERS[area.slug]?.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 나의 월드 보기 (text link) */}
        <button
          onClick={() => setGardenOpen((v) => !v)}
          className="mt-3 text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          나의 월드 보기 {gardenOpen ? '↑' : '→'}
        </button>

        {/* 인라인 젤리 정원 */}
        <AnimatePresence initial={false}>
          {gardenOpen && (
            <motion.div
              className="w-full max-w-sm overflow-hidden"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
            >
              <JellyGarden area={area} layer={layer} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 반원 회전 휠 */}
        <div className="w-full max-w-md mt-6">
          <WorldWheel selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
        </div>
      </div>

      {/* 오늘의 응원 — 폴더 모양 하단 고정 (네비 위로 띄움) */}
      <div className="fixed left-0 right-0 z-20 px-3" style={{ bottom: 96 }}>
        <button
          onClick={() => setDrawerOpen(true)}
          className="relative block w-full text-left active:translate-y-0.5 transition-transform"
        >
          {/* 폴더 뒤판 — 우측 뒤가 위로 올라온 탭 */}
          <div
            className="absolute right-5 h-6 w-28 rounded-t-xl bg-amber-100 border border-amber-200/70"
            style={{ top: -10, zIndex: 0 }}
          />
          {/* 폴더 앞판 */}
          <div
            className="relative flex items-center justify-between rounded-2xl bg-white px-5 py-3.5 border border-gray-100"
            style={{ zIndex: 1, boxShadow: '0 -2px 14px rgba(0,0,0,0.05), 0 10px 26px rgba(0,0,0,0.10)' }}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🗂️</span>
              <span className="text-sm font-semibold text-gray-800">오늘의 응원</span>
              {todayReceivedCount > 0 && (
                <span className="px-2 py-0.5 bg-primary-100 text-primary-600 text-[11px] font-bold rounded-full">
                  {todayReceivedCount}
                </span>
              )}
            </div>
            <span className="text-gray-400 text-sm">▲</span>
          </div>
        </button>
      </div>

      <CheerDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        received={deliveredReceived}
        sent={normalSent}
        reactionMutation={reactionMutation}
      />
    </div>
  );
};
