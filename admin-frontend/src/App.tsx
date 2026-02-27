import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminQuestCreatePage } from '@/pages/AdminQuestCreatePage';
import { AdminQuestSubmissionsPage } from '@/pages/AdminQuestSubmissionsPage';
import { AdminChallengeCreatePage } from '@/pages/AdminChallengeCreatePage';
import { AdminLoginPage } from '@/pages/AdminLoginPage';
import { AdminMyChallengesPage } from '@/pages/AdminMyChallengesPage';
import { AdminAllChallengesPage } from '@/pages/AdminAllChallengesPage';
import { AdminOpsDashboardPage } from '@/pages/AdminOpsDashboardPage';
import { AdminAuditLogsPage } from '@/pages/AdminAuditLogsPage';
import '@/styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 } },
});

type JwtPayload = {
  sub?: string;
  exp?: number;
  ['cognito:groups']?: string | string[];
};

type Role = 'admins' | 'productowners' | 'leaders' | 'managers';

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

function parseGroups(payload: JwtPayload | null): string[] {
  if (!payload) return [];
  const raw = payload['cognito:groups'];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    return raw
      .split(/[,:]/)
      .map(s => s.replace(/[\[\]"']/g, '').trim())
      .filter(Boolean);
  }
  return [];
}

function getAuthContext() {
  const token = localStorage.getItem('accessToken');
  if (!token) return { authenticated: false, groups: [] as string[], payload: null as JwtPayload | null };

  const payload = parseJwtPayload(token);
  if (!payload) return { authenticated: false, groups: [] as string[], payload: null as JwtPayload | null };

  if (payload.exp) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSec) return { authenticated: false, groups: [] as string[], payload: null as JwtPayload | null };
  }

  const groups = parseGroups(payload);
  const allowed = new Set<Role>(['admins', 'productowners', 'leaders', 'managers']);
  const authenticated = groups.some(g => allowed.has(g as Role));

  return { authenticated, groups, payload };
}

function hasAnyRole(groups: string[], roles: Role[]) {
  return roles.some(role => groups.includes(role));
}

const RoleRoute = ({ children, roles }: { children: React.ReactNode; roles: Role[] }) => {
  const { authenticated, groups } = getAuthContext();
  if (!authenticated) return <Navigate to="/login" replace />;
  if (!hasAnyRole(groups, roles)) return <Navigate to="/admin/forbidden" replace />;
  return <>{children}</>;
};

const PublicOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { authenticated } = getAuthContext();
  if (authenticated) return <Navigate to="/admin/challenges/mine" replace />;
  return <>{children}</>;
};

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { groups } = getAuthContext();

  const nav: Array<{ path: string; label: string }> = [];

  if (hasAnyRole(groups, ['admins', 'productowners', 'leaders'])) {
    nav.push({ path: '/admin/challenges/create', label: '🏆 챌린지 생성' });
  }

  if (hasAnyRole(groups, ['admins'])) {
    nav.push({ path: '/admin/challenges/all', label: '🚨 응급운영 전체조회(관리자)' });
  }

  if (hasAnyRole(groups, ['admins', 'productowners', 'leaders'])) {
    nav.push({ path: '/admin/challenges/mine', label: '📚 내 챌린지/퀘스트' });
  }

  if (hasAnyRole(groups, ['admins', 'productowners', 'leaders', 'managers'])) {
    nav.push({ path: '/admin/ops/dashboard', label: '📊 운영 대시보드' });
    nav.push({ path: '/admin/audit/logs', label: '🧾 감사 로그' });
    nav.push({ path: '/admin/quests/create', label: '➕ 퀘스트 생성' });
    nav.push({ path: '/admin/quests/submissions', label: '📋 제출물 심사' });
  }

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
        {nav.map((item) => (
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

const ForbiddenPage = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
    <div className="bg-white border border-red-200 rounded-2xl p-6 max-w-md w-full text-center">
      <h1 className="text-xl font-bold text-gray-900 mb-2">접근 권한이 없습니다</h1>
      <p className="text-sm text-gray-600">현재 계정 그룹으로는 이 메뉴에 접근할 수 없습니다.</p>
    </div>
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

          <Route path="/admin/forbidden" element={<ForbiddenPage />} />

          <Route
            path="/"
            element={<Navigate to={getAuthContext().authenticated ? '/admin/challenges/mine' : '/login'} replace />}
          />


          <Route
            path="/admin/ops/dashboard"
            element={
              <RoleRoute roles={['admins', 'productowners', 'leaders', 'managers']}>
                <Layout>
                  <AdminOpsDashboardPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/audit/logs"
            element={
              <RoleRoute roles={['admins', 'productowners', 'leaders', 'managers']}>
                <Layout>
                  <AdminAuditLogsPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/quests/submissions"
            element={
              <RoleRoute roles={['admins', 'productowners', 'leaders', 'managers']}>
                <Layout>
                  <AdminQuestSubmissionsPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/quests/create"
            element={
              <RoleRoute roles={['admins', 'productowners', 'leaders', 'managers']}>
                <Layout>
                  <AdminQuestCreatePage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/challenges/create"
            element={
              <RoleRoute roles={['admins', 'productowners', 'leaders']}>
                <Layout>
                  <AdminChallengeCreatePage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/challenges/all"
            element={
              <RoleRoute roles={['admins']}>
                <Layout>
                  <AdminAllChallengesPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/challenges/mine"
            element={
              <RoleRoute roles={['admins', 'productowners', 'leaders']}>
                <Layout>
                  <AdminMyChallengesPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
