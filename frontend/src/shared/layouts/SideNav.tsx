import { useLocation, useNavigate } from 'react-router-dom';

type IconKey = 'challenges' | 'outer-space' | 'today' | 'my';

const NAV_ITEMS: (
  | { path: string; iconKey: IconKey; label: string; isME?: false }
  | { path: string; isME: true; label: string }
)[] = [
  { path: '/challenges', iconKey: 'challenges', label: '챌린지' },
  { path: '/outer-space', iconKey: 'outer-space', label: '마당' },
  { path: '/me', isME: true, label: 'ME' },
  { path: '/today', iconKey: 'today', label: '오늘' },
  { path: '/my', iconKey: 'my', label: '마이' },
];

const NavIcon = ({ iconKey }: { iconKey: IconKey }) => {
  const p = {
    className: 'w-[18px] h-[18px]',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (iconKey === 'challenges') return (
    <svg {...p}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
  if (iconKey === 'outer-space') return (
    <svg {...p}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
  if (iconKey === 'today') return (
    <svg {...p}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
  return (
    <svg {...p}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
};

export const SideNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className="hidden lg:flex fixed left-0 top-0 h-screen w-60 flex-col py-6 z-20"
      style={{
        background: 'rgba(255, 255, 255, 0.70)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: '1px solid rgba(255, 255, 255, 0.55)',
        boxShadow: '4px 0 28px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* 로고 */}
      <div className="px-6 mb-8">
        <span
          className="text-2xl font-extrabold tracking-tight"
          style={{ color: 'var(--color-primary, #C07A74)' }}
        >
          CHME
        </span>
        <p className="text-xs text-gray-400 mt-0.5">Challenge Earth with ME</p>
      </div>

      {/* 네비게이션 아이템 */}
      <div className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path === '/challenges' && location.pathname === '/');

          if (item.isME) {
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  isActive ? 'text-white' : 'text-gray-500 hover:text-gray-800'
                }`}
                style={
                  isActive
                    ? {
                        background:
                          'linear-gradient(135deg, var(--color-primary-500, #C07A74), var(--color-primary-700, #854845))',
                        boxShadow: '0 2px 12px rgba(192,122,116,0.30)',
                      }
                    : {}
                }
              >
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 transition-all ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-gradient-to-br from-primary-400 to-primary-600 text-white'
                  }`}
                >
                  ME
                </span>
                <span>{item.label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 bg-white/60 rounded-full" />
                )}
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive ? 'text-primary-700' : 'text-gray-500 hover:text-gray-800'
              }`}
              style={
                isActive
                  ? { background: 'rgba(192, 122, 116, 0.10)' }
                  : {}
              }
            >
              <span
                className={`w-8 h-8 flex items-center justify-center flex-shrink-0 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'text-primary-600'
                    : 'text-gray-400 group-hover:text-primary-500'
                }`}
              >
                <NavIcon iconKey={item.iconKey} />
              </span>
              <span className="transition-all duration-200">{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* 하단 */}
      <div
        className="px-4 pt-4"
        style={{ borderTop: '1px solid rgba(0, 0, 0, 0.06)' }}
      >
        <p className="text-xs text-gray-400 text-center">© 2025 CHME</p>
      </div>
    </nav>
  );
};
