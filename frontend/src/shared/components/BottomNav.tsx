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
      className="fixed bottom-0 left-0 right-0 safe-area-bottom z-30 lg:hidden"
      style={{
        // glassmorphism — 뒤 배경색이 약간 비치도록 투명도↑ + 강한 블러/채도
        background: 'rgba(255, 255, 255, 0.48)',
        backdropFilter: 'blur(30px) saturate(180%)',
        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        borderTop: '1px solid rgba(255, 255, 255, 0.65)',
        boxShadow: '0 -1px 0 rgba(0,0,0,0.03), 0 -6px 24px rgba(0, 0, 0, 0.06)',
      }}
    >
      <div className="flex items-end justify-around px-2 pt-1.5 pb-1">
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
                  className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md ring-1 ring-white/60 ${
                    isActive
                      ? 'bg-gradient-to-br from-primary-500 to-primary-700'
                      : 'bg-gradient-to-br from-primary-400 to-primary-600'
                  }`}
                >
                  <span className="text-white font-bold text-sm">ME</span>
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
