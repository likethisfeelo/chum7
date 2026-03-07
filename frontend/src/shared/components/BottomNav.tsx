import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { path: '/challenges', icon: '🎯', label: '챌린지' },
  { path: '/outer-space', icon: '🚀', label: '마당' },
  { path: '/me', icon: null, label: 'ME', isME: true },
  { path: '/today', icon: '📊', label: '오늘' },
  { path: '/assets', icon: '👤', label: '프로필' },
];

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom z-30">
      <div className="flex items-end justify-around px-2 pt-2 pb-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path === '/challenges' && location.pathname === '/');

          if (item.isME) {
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center relative -top-3"
              >
                <motion.div
                  whileTap={{ scale: 0.95 }}
                  className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${
                    isActive
                      ? 'bg-gradient-to-br from-primary-500 to-primary-700'
                      : 'bg-gradient-to-br from-primary-400 to-primary-600'
                  }`}
                >
                  <span className="text-white font-bold text-xl">ME</span>
                </motion.div>
                <span className={`text-xs mt-1 font-medium ${isActive ? 'text-primary-600' : 'text-gray-500'}`}>
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center py-1 px-3 min-w-[56px]"
            >
              <motion.span
                whileTap={{ scale: 0.9 }}
                className={`text-2xl mb-1 ${isActive ? 'scale-110' : ''}`}
              >
                {item.icon}
              </motion.span>
              <span className={`text-xs font-medium ${isActive ? 'text-primary-600' : 'text-gray-500'}`}>
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
