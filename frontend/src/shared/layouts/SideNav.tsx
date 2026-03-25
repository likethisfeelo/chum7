import { useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/challenges', icon: '🎯', label: '챌린지' },
  { path: '/outer-space', icon: '🚀', label: '마당' },
  { path: '/me', icon: null, label: 'ME', isME: true },
  { path: '/today', icon: '📊', label: '오늘' },
  { path: '/assets', icon: '👤', label: '프로필' },
];

export const SideNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="hidden lg:flex fixed left-0 top-0 h-screen w-60 bg-white border-r border-gray-100 flex-col py-6 z-20">
      <div className="px-6 mb-8">
        <span className="text-2xl font-extrabold" style={{ color: 'var(--color-primary, #FF9B71)' }}>
          CHME
        </span>
        <p className="text-xs text-gray-400 mt-0.5">Challenge Earth with ME</p>
      </div>

      <div className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path === '/challenges' && location.pathname === '/');

          if (item.isME) {
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-gradient-to-br from-primary-400 to-primary-600 text-white'
                  }`}
                >
                  ME
                </span>
                <span>{item.label}</span>
                {isActive && <div className="ml-auto w-1.5 h-1.5 bg-white/70 rounded-full" />}
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-xl w-8 text-center flex-shrink-0">{item.icon}</span>
              <span>{item.label}</span>
              {isActive && <div className="ml-auto w-1.5 h-1.5 bg-primary-500 rounded-full" />}
            </button>
          );
        })}
      </div>

      <div className="px-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">© 2025 CHME</p>
      </div>
    </nav>
  );
};
