import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminQuestCreatePage } from '@/pages/AdminQuestCreatePage';
import { AdminQuestSubmissionsPage } from '@/pages/AdminQuestSubmissionsPage';
import { AdminChallengeCreatePage } from '@/pages/AdminChallengeCreatePage';
import { AdminLoginPage } from '@/pages/AdminLoginPage';
import '@/styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 } },
});

const NAV = [
  { path: '/admin/challenges/create', label: '🏆 챌린지 생성' },
  { path: '/admin/quests/submissions', label: '📋 제출물 심사' },
  { path: '/admin/quests/create', label: '➕ 퀘스트 생성' },
];

type JwtPayload = {
  exp?: number;
  ['cognito:groups']?: string | string[];
};

function parseJwtPayload(token: string): JwtPayload | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized);
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

function hasAdminRole(payload: JwtPayload): boolean {
  const groups = payload['cognito:groups'];
  if (!groups) return false;
  if (typeof groups === 'string') return groups === 'admins' || groups === 'leaders';
  return groups.includes('admins') || groups.includes('leaders');
}

const isAuthenticated = () => {
  const token = localStorage.getItem('accessToken');
  if (!token) return false;

  const payload = parseJwtPayload(token);
  if (!payload) return false;

  if (!hasAdminRole(payload)) return false;

  if (payload.exp) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSec) return false;
  }

  return true;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  if (isAuthenticated()) return <Navigate to="/admin/quests/submissions" replace />;
  return <>{children}</>;
};

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-white flex flex-col flex-shrink-0">
      <div className="px-5 py-6 border-b border-gray-700">
        <h1 className="text-xl font-bold text-white">CHME Admin</h1>
        <p className="text-xs text-gray-400 mt-0.5">관리자 대시보드</p>
      </div>
      <nav className="p-3 flex-1">
        {NAV.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors ${
              location.pathname === item.path
                ? 'bg-primary-600 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800"
        >
          로그아웃
        </button>
      </div>
    </aside>
  );
};

const Layout = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen bg-gray-50">
    <Sidebar />
    <main className="flex-1 overflow-auto">{children}</main>
  </div>
);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <AdminLoginPage />
              </PublicOnlyRoute>
            }
          />

          <Route
            path="/"
            element={<Navigate to={isAuthenticated() ? '/admin/quests/submissions' : '/login'} replace />}
          />

          <Route
            path="/admin/quests/submissions"
            element={
              <ProtectedRoute>
                <Layout>
                  <AdminQuestSubmissionsPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/quests/create"
            element={
              <ProtectedRoute>
                <Layout>
                  <AdminQuestCreatePage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/challenges/create"
            element={
              <ProtectedRoute>
                <Layout>
                  <AdminChallengeCreatePage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
