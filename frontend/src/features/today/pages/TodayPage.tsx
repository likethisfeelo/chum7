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
import { DEFAULT_BANNERS } from '@/features/challenge/constants/categories';

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
// hex → rgba(a)
function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// ── 영역별 라인아트 아이콘 ────────────────────────────────────────────
const WHEEL_ICON_PATHS: Record<string, JSX.Element> = {
  expand: ( // 새싹
    <>
      <path d="M12 21 V12.5" />
      <path d="M12 13 C12 9.5 9.2 7.5 5.5 7.5 C5.5 11 8.3 13 12 13 Z" />
      <path d="M12 12.2 C12 9 14.6 7.2 18 7.2 C18 10.4 15.4 12.2 12 12.2 Z" />
    </>
  ),
  mindfulness: ( // 불꽃
    <path d="M12 3 C12 3 6.8 8 6.8 13 A5.2 5.2 0 0 0 17.2 13 C17.2 9.8 15 8.6 14 6.2 C13 8 12 7.6 12 3 Z" />
  ),
  health: ( // 하트 + 스파클
    <>
      <path d="M12 20 C12 20 4.5 14 4.5 8.9 C4.5 6.3 6.5 4.4 9 4.4 C10.5 4.4 11.6 5.3 12 6.3 C12.4 5.3 13.5 4.4 15 4.4 C17.5 4.4 19.5 6.3 19.5 8.9 C19.5 14 12 20 12 20 Z" />
      <path d="M12 8.6 L12.7 10.5 L14.6 11.2 L12.7 11.9 L12 13.8 L11.3 11.9 L9.4 11.2 L11.3 10.5 Z" fill="currentColor" stroke="none" />
    </>
  ),
  habit: ( // 번개
    <path d="M13 3 L6 13.2 H11 L10.4 21 L18 10.4 H12.6 L13 3 Z" />
  ),
  creativity: ( // 나침반 별
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 6 L13.5 10.5 L18 12 L13.5 13.5 L12 18 L10.5 13.5 L6 12 L10.5 10.5 Z" />
    </>
  ),
};

function WheelIcon({ slug, color, size = 26 }: { slug: string; color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color }}
    >
      {WHEEL_ICON_PATHS[slug] ?? WHEEL_ICON_PATHS.health}
    </svg>
  );
}

// ── 디야(등잔) 촛불 — 방사형 빛 + 금빛 등잔 ───────────────────────────
function CheerCandle() {
  const rays = Array.from({ length: 13 }, (_, i) => {
    const deg = -78 + i * 13;
    const a = (deg * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const cx = 36;
    const cy = 48;
    const r1 = 19;
    const r2 = 19 + (i % 2 === 0 ? 12 : 7);
    return { key: i, x1: cx + dx * r1, y1: cy + dy * r1, x2: cx + dx * r2, y2: cy + dy * r2 };
  });
  return (
    <svg width="72" height="100" viewBox="0 0 72 100" fill="none">
      <defs>
        <linearGradient id="cndFlame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F7C7CC" />
          <stop offset="55%" stopColor="#F0908A" />
          <stop offset="100%" stopColor="#E8654F" />
        </linearGradient>
        <linearGradient id="cndGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F0D488" />
          <stop offset="100%" stopColor="#C99A3B" />
        </linearGradient>
        <filter id="cndBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      {/* 방사형 빛 */}
      <g stroke="#E9A7A0" strokeWidth="1" strokeLinecap="round" opacity="0.55">
        {rays.map((r) => (
          <line key={r.key} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
        ))}
      </g>
      {/* 후광 */}
      <ellipse cx="36" cy="50" rx="15" ry="22" fill="#F3A6A0" opacity="0.22" filter="url(#cndBlur)" />
      {/* 불꽃 */}
      <path d="M36 28 C41 40 45 46 45 53 C45 60 41 64 36 64 C31 64 27 60 27 53 C27 46 31 40 36 28 Z" fill="url(#cndFlame)" />
      <path d="M36 40 C38.5 47 40 50 40 53.5 C40 57 38.4 59 36 59 C33.6 59 32 57 32 53.5 C32 50 33.5 47 36 40 Z" fill="#FCE6DC" opacity="0.85" />
      {/* 등잔 */}
      <ellipse cx="36" cy="67" rx="18" ry="5" fill="#F1D588" />
      <path d="M18 67 A18 5 0 0 0 54 67 C54 67 50 76 36 76 C22 76 18 67 18 67 Z" fill="url(#cndGold)" />
      <ellipse cx="36" cy="79" rx="15" ry="3" fill="#000000" opacity="0.05" />
    </svg>
  );
}

// ── SVG 달/행성 ───────────────────────────────────────────────────────
function Moon({ area }: { area: WorldArea }) {
  const light = tint(area.color, 0.62);
  const dark = shade(area.color, 0.1);
  const crater = shade(area.color, 0.08);
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
        {/* 후광 (부드러운 파스텔 워터컬러) */}
        <circle cx="90" cy="90" r="74" fill={area.color} opacity="0.2" filter={`url(#${glow})`} />
        {/* 헤일로 링 */}
        <circle cx="90" cy="90" r="75" fill="none" stroke={area.color} strokeWidth="1" opacity="0.16" />
        {/* 본체 */}
        <circle cx="90" cy="90" r="66" fill={`url(#${gid})`} />
        {/* 크레이터 (아주 옅게) */}
        <ellipse cx="112" cy="66" rx="13" ry="11" fill={crater} opacity="0.2" />
        <ellipse cx="70" cy="108" rx="17" ry="15" fill={crater} opacity="0.16" />
        <ellipse cx="118" cy="112" rx="8" ry="7" fill={crater} opacity="0.18" />
        <ellipse cx="64" cy="70" rx="6" ry="5" fill={crater} opacity="0.16" />
        {/* 하이라이트 */}
        <circle cx="64" cy="58" r="20" fill="#ffffff" opacity="0.24" />
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
        <path d={WHEEL_ARC_PATH} fill="none" stroke="#CDBBBB" strokeWidth={1} strokeLinecap="round" opacity={0.6} />
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
            style={{ left: 'calc(50% - 28px)', top: WHEEL_BASE_TOP }}
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
                width: 56,
                height: 56,
                background: 'rgba(255,255,255,0.5)',
                border: `1px solid ${rgba(area.color, isSel ? 0.6 : 0.32)}`,
                boxShadow: isSel
                  ? `0 0 0 5px ${rgba(area.color, 0.1)}, 0 4px 20px ${rgba(area.color, 0.45)}`
                  : `0 2px 14px ${rgba(area.color, 0.22)}`,
                backdropFilter: 'blur(2px)',
                WebkitBackdropFilter: 'blur(2px)',
              }}
            >
              <WheelIcon slug={area.slug} color={area.color} size={26} />
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
            {/* 전체 이력 링크 — 전용 이력 페이지로 전환 */}
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => { onClose(); navigate('/cheers/history'); }}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                응원 전체 이력 확인 →
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
      className="relative flex flex-col bg-white"
      style={{ minHeight: 'calc(100dvh - 80px)' }}
    >
      <div className="flex-1 flex flex-col items-center px-6 pt-2 pb-24">
        {/* 달 — 상단에 반원만 노출 (위로 올려 클리핑) */}
        <div className="w-full flex justify-center overflow-hidden" style={{ height: 92 }}>
          <div style={{ marginTop: -88 }}>
            <Moon area={area} />
          </div>
        </div>

        {/* 영역 이름 + 설명 */}
        <div className="text-center mt-3 min-h-[60px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={area.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              <h1
                className="font-world text-4xl font-medium"
                style={{ color: shade(area.color, 0.15) }}
              >
                {area.name.charAt(0) + area.name.slice(1).toLowerCase()}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {DEFAULT_BANNERS[area.slug]?.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 월드(젤리 정원) 펼침 토글 — 위/아래 뾰족 캐럿만, 가운데 정렬, 영역색 */}
        <div className="w-full max-w-md flex justify-center mt-2">
          <button
            onClick={() => setGardenOpen((v) => !v)}
            aria-label="나의 월드 보기"
            className="p-1.5"
            style={{ color: shade(area.color, 0.1) }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: gardenOpen ? 'none' : 'rotate(180deg)', transition: 'transform 0.25s' }}
            >
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
        </div>

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

        {/* 반원 회전 휠 — 이미 가운데인 노드 재탭 시 월드 펼침/접힘 */}
        <div className="w-full max-w-md mt-4">
          <WorldWheel
            selectedIndex={selectedIndex}
            onSelect={(i) => {
              if (i === selectedIndex) setGardenOpen((v) => !v);
              else setSelectedIndex(i);
            }}
          />
        </div>

        {/* 오늘의 응원 — 촛불 버튼 (인플로우: 월드 펼치면 같이 내려감) */}
        <div className="flex justify-center mt-2 shrink-0">
          <motion.button
            onClick={() => setDrawerOpen(true)}
            aria-label="오늘의 응원 열기"
            className="relative"
            initial={{ opacity: 0, y: 6 }}
            animate={{
              opacity: 1,
              y: 0,
              // 테두리가 은은히 빛나는 글로우 (원 배경 없이 아이콘 외곽)
              filter: [
                'drop-shadow(0 0 3px rgba(255,168,64,0.45))',
                'drop-shadow(0 0 11px rgba(255,168,64,0.85))',
                'drop-shadow(0 0 3px rgba(255,168,64,0.45))',
              ],
            }}
            transition={{
              opacity: { duration: 0.3 },
              y: { duration: 0.3 },
              filter: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' },
            }}
            whileTap={{ scale: 0.93 }}
          >
            <CheerCandle />
            {todayReceivedCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-primary-600 text-[10px] font-bold flex items-center justify-center border border-primary-100 shadow-sm">
                {todayReceivedCount}
              </span>
            )}
          </motion.button>
        </div>
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
