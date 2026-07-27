import { motion } from 'framer-motion';

/**
 * 프로필 오브 — 월드 5색이 은은히 순환(ME 버튼 11s보다 느린 18s)하며 물결치고,
 * 안에 흰색 구슬(마블) 라인이 흐르는 아이콘.
 */
const WORLD_COLORS = ['#86B183', '#E3A276', '#D97E7E', '#D6BA76', '#A896D4', '#86B183'];

export function ProfileOrb({ size = 40 }: { size?: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-full ring-1 ring-white/60"
      style={{ width: size, height: size, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
    >
      {/* 5색 순환 — ME 버튼보다 느리게 */}
      <motion.div
        className="absolute inset-0"
        animate={{ backgroundColor: WORLD_COLORS }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', times: [0, 0.2, 0.4, 0.6, 0.8, 1] }}
      />
      {/* 물결치는 밝은 오버레이 (천천히 이동) */}
      <motion.div
        className="absolute inset-[-35%]"
        style={{ background: 'radial-gradient(circle at 32% 30%, rgba(255,255,255,0.45), rgba(255,255,255,0) 55%)' }}
        animate={{ x: ['-8%', '8%', '-8%'], y: ['-6%', '7%', '-6%'] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* 흰 구슬(마블) 라인 — 느리게 회전 */}
      <motion.svg
        viewBox="0 0 40 40"
        className="absolute inset-0 h-full w-full"
        fill="none"
        animate={{ rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
      >
        <path d="M20 3 C 11 12, 29 27, 20 37" stroke="white" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
        <path d="M7 15 C 16 19, 24 21, 33 25" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      </motion.svg>
      {/* 광택 */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(circle at 34% 26%, rgba(255,255,255,0.55), rgba(255,255,255,0) 60%)' }}
      />
    </div>
  );
}
