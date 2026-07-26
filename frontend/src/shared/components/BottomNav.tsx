import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { path: '/challenges', icon: '🎯', label: '챌린지' },
  { path: '/plaza', icon: '🚀', label: '마당' },
  { path: '/me', icon: null, label: 'ME', isME: true },
  { path: '/today', icon: '📊', label: '여정' },
  { path: '/my', icon: '✨', label: '마이' },
];

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 safe-area-bottom z-30 lg:hidden rounded-t-[26px]"
      style={{
        // 리퀴드 글래스 — 배경이 비치는 프로스트 + 유리 엣지 하이라이트
        background: 'rgba(255, 255, 255, 0.55)',
        backdropFilter: 'blur(32px) saturate(185%)',
        WebkitBackdropFilter: 'blur(32px) saturate(185%)',
        borderTop: '1px solid rgba(255, 255, 255, 0.75)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 3px rgba(255,255,255,0.35), 0 -8px 30px rgba(0,0,0,0.08)',
      }}
    >
      {/* 상단 글로시 시트 (유리 반사) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-9 rounded-t-[26px]"
        style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.5), rgba(255,255,255,0))' }}
      />
      <div className="relative flex items-end justify-around px-2 pt-1.5 pb-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path === '/challenges' && location.pathname === '/');

          if (item.isME) {
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center relative -top-2"
              >
                <motion.div
                  whileTap={{ scale: 0.95 }}
                  className={`w-12 h-12 rounded-full flex items-center justify-center ring-1 ring-white/70 ${
                    isActive
                      ? 'bg-gradient-to-br from-primary-500 to-primary-700'
                      : 'bg-gradient-to-br from-primary-400 to-primary-600'
                  }`}
                  style={{
                    // 유리 베벨 — 상단 하이라이트 + 하단 음영 + 컬러 글로우
                    boxShadow:
                      'inset 0 2px 4px rgba(255,255,255,0.5), inset 0 -3px 6px rgba(0,0,0,0.18), 0 8px 18px rgba(217,83,106,0.35)',
                  }}
                >
                  <span className="text-white font-bold text-sm drop-shadow-sm">ME</span>
                </motion.div>
                <span className={`text-[11px] mt-0.5 font-medium ${isActive ? 'text-primary-600' : 'text-gray-500'}`}>
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center py-1 px-3 min-w-[52px]"
            >
              <motion.span
                whileTap={{ scale: 0.9 }}
                className={`text-xl mb-0.5 ${isActive ? 'scale-110' : ''}`}
              >
                {item.icon}
              </motion.span>
              <span className={`text-[11px] font-medium ${isActive ? 'text-primary-600' : 'text-gray-500'}`}>
                {item.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="activeIndicator"
                  className="absolute bottom-0 w-1.5 h-1.5 bg-primary-500 rounded-full"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
