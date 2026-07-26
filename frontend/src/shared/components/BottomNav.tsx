import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

type NavItem = { path: string; iconKey: string | null; label: string; isME?: boolean };
const NAV_ITEMS: NavItem[] = [
  { path: '/challenges', iconKey: 'challenge', label: '챌린지' },
  { path: '/plaza', iconKey: 'plaza', label: '마당' },
  { path: '/me', iconKey: null, label: 'ME', isME: true },
  { path: '/today', iconKey: 'today', label: '여정' },
  { path: '/my', iconKey: 'my', label: '마이' },
];

// 하얀선 라인아트 아이콘 (currentColor 사용)
function NavIcon({ name }: { name: string }) {
  const p = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'challenge': // 타겟
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8.2" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'plaza': // 새싹
      return (
        <svg {...p}>
          <path d="M12 20V11" />
          <path d="M12 12C12 8.3 9.2 6.3 5.5 6.3 5.5 9.8 8.3 12 12 12Z" />
          <path d="M12 11.2C12 7.7 14.6 5.7 18 5.7 18 9.1 15.4 11.2 12 11.2Z" />
        </svg>
      );
    case 'today': // 지평선 위 해
      return (
        <svg {...p}>
          <path d="M3 18h18" />
          <path d="M6.5 18a5.5 5.5 0 0 1 11 0" />
          <path d="M12 4.5V6" />
          <path d="M4.8 8.8l1 1" />
          <path d="M19.2 8.8l-1 1" />
        </svg>
      );
    case 'my': // 사람
      return (
        <svg {...p}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.8 20a6.2 6.2 0 0 1 12.4 0" />
        </svg>
      );
    default:
      return null;
  }
}

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className="fixed bottom-[6px] left-2 right-2 z-30 lg:hidden rounded-[28px]"
      style={{
        // 연한 리퀴드 글래스 — 밝고 투명하게(배경 비침)
        background: 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.6)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 8px 26px rgba(0,0,0,0.10)',
      }}
    >
      <div className="relative flex items-end justify-around px-2 pt-2 pb-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path === '/challenges' && location.pathname === '/');

          if (item.isME) {
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center relative -top-4"
                aria-label="ME"
              >
                <motion.div
                  whileTap={{ scale: 0.95 }}
                  className="relative w-16 h-16 rounded-full ring-1 ring-white/60 overflow-hidden"
                  style={{ boxShadow: '0 8px 22px rgba(0,0,0,0.18)' }}
                >
                  {/* 월드 5색을 하나씩 은은하게·천천히 순환 */}
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    animate={{
                      backgroundColor: ['#86B183', '#E3A276', '#D97E7E', '#D6BA76', '#A896D4', '#86B183'],
                    }}
                    transition={{
                      duration: 11,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      times: [0, 0.2, 0.4, 0.6, 0.8, 1],
                    }}
                  />
                  {/* 부드러운 광택(그라데이션 느낌) */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'radial-gradient(circle at 34% 28%, rgba(255,255,255,0.55), rgba(255,255,255,0) 62%)' }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white font-bold text-base" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                      ME
                    </span>
                  </div>
                </motion.div>
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center py-1 px-3 min-w-[52px]"
            >
              <motion.span
                whileTap={{ scale: 0.9 }}
                className={`mb-0.5 transition-colors ${isActive ? 'text-primary-600' : 'text-gray-400'}`}
              >
                <NavIcon name={item.iconKey as string} />
              </motion.span>
              <span className={`text-[11px] font-medium ${isActive ? 'text-primary-600' : 'text-gray-400'}`}>
                {item.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="activeIndicator"
                  className="absolute left-1/2 -translate-x-1/2 -bottom-0.5 w-1.5 h-1.5 rounded-full"
                  style={{ background: '#F58AA0' }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
