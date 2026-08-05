import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminQuestSubmissionsPage } from '@/pages/AdminQuestSubmissionsPage';
import { AdminQuestProposalsPage } from '@/pages/AdminQuestProposalsPage';
import { AdminChallengeCreatePage } from '@/pages/AdminChallengeCreatePage';
import { AdminLoginPage } from '@/pages/AdminLoginPage';
import { AdminForgotPasswordPage } from '@/pages/AdminForgotPasswordPage';
import { AdminMyChallengesPage } from '@/pages/AdminMyChallengesPage';
import { AdminAllChallengesPage } from '@/pages/AdminAllChallengesPage';
import { AdminOpsDashboardPage } from '@/pages/AdminOpsDashboardPage';
import { AdminAuditLogsPage } from '@/pages/AdminAuditLogsPage';
import { AdminNotificationsPage } from '@/pages/AdminNotificationsPage';
import { AdminCategoryBannersPage } from '@/pages/AdminCategoryBannersPage';
import { AdminPlazaPostPage } from '@/pages/AdminPlazaPostPage';
import { AdminReportsPage } from '@/pages/AdminReportsPage';
import { AdminDisbandRequestsPage } from '@/pages/AdminDisbandRequestsPage';
import { AdminCheerMonitorPage } from '@/pages/AdminCheerMonitorPage';
import { AdminCommerceCouponsPage } from '@/pages/AdminCommerceCouponsPage';
import { AdminCommerceOrdersPage } from '@/pages/AdminCommerceOrdersPage';
import { AdminCommerceSettlementsPage } from '@/pages/AdminCommerceSettlementsPage';
import '@/styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 } },
});

type JwtPayload = {
  sub?: string;
  exp?: number;
  ['cognito:groups']?: string | string[];
};

// 신규 3그룹 모델 (admin-api PORTING.md §2): admins / operators / creators
// 레거시 매핑: admins→admins, productowners/managers→operators, leaders→creators
type Role = 'admins' | 'operators' | 'creators';

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
  const allowed = new Set<Role>(['admins', 'operators', 'creators']);
  const authenticated = groups.some(g => allowed.has(g as Role));

  return { authenticated, groups, payload };
}

function hasAnyRole(groups: string[], roles: Role[]) {
  return roles.some(role => groups.includes(role));
}

/** 로그인 후 기본 이동 경로 — creators는 운영 대시보드 접근 불가 → 내 챌린지로 */
function defaultPath(groups: string[]) {
  return hasAnyRole(groups, ['admins', 'operators']) ? '/admin/ops/dashboard' : '/admin/challenges/mine';
}

const RoleRoute = ({ children, roles }: { children: React.ReactNode; roles: Role[] }) => {
  const { authenticated, groups } = getAuthContext();
  if (!authenticated) return <Navigate to="/login" replace />;
  if (!hasAnyRole(groups, roles)) return <Navigate to="/admin/forbidden" replace />;
  return <>{children}</>;
};

const PublicOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { authenticated, groups } = getAuthContext();
  if (authenticated) return <Navigate to={defaultPath(groups)} replace />;
  return <>{children}</>;
};

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { groups } = getAuthContext();

  const nav: Array<{ path: string; label: string; section?: string }> = [];

  // creators(챌린지 생성자)는 내 챌린지 관련 메뉴만 노출 (admin-api PORTING.md §2)
  if (hasAnyRole(groups, ['admins', 'creators'])) {
    nav.push({ path: '/admin/challenges/create', label: '🏆 챌린지 생성' });
  }

  if (hasAnyRole(groups, ['admins', 'operators'])) {
    nav.push({ path: '/admin/challenges/all', label: '🚨 응급운영 전체조회(관리자)' });
  }

  if (hasAnyRole(groups, ['admins', 'operators', 'creators'])) {
    nav.push({ path: '/admin/challenges/mine', label: '📚 내 챌린지/퀘스트' });
    nav.push({ path: '/admin/quests/submissions', label: '📋 제출물 심사' });
    nav.push({ path: '/admin/quests/proposals', label: '📝 개인 퀘스트 제안 심사' });
  }

  if (hasAnyRole(groups, ['admins', 'operators'])) {
    nav.push({ path: '/admin/category-banners', label: '🖼️ 카테고리 배너' });
    nav.push({ path: '/admin/plaza', label: '📣 마당 게시물' });
    nav.push({ path: '/admin/reports', label: '🚩 신고 관리' });
    nav.push({ path: '/admin/disband-requests', label: '🚨 해산 신청 관리' });
    nav.push({ path: '/admin/ops/dashboard', label: '📊 운영 대시보드' });
    nav.push({ path: '/admin/audit/logs', label: '🧾 감사 로그' });
    nav.push({ path: '/admin/notifications', label: '🔔 알림함' });
    nav.push({ path: '/admin/cheer/monitor', label: '📣 응원 모니터' });
  }

  // 커머스 콘솔 — 슈퍼어드민(admins) 전용 (/pay/admin/*)
  if (hasAnyRole(groups, ['admins'])) {
    nav.push({ path: '/admin/commerce/coupons', label: '🎟️ 쿠폰 관리', section: '커머스' });
    nav.push({ path: '/admin/commerce/orders', label: '💰 주문/입금 관리', section: '커머스' });
    nav.push({ path: '/admin/commerce/settlements', label: '💸 반환/정산 관리', section: '커머스' });
  }

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login', { replace: true });
  };

  let renderedSection: string | undefined;

  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-white flex flex-col flex-shrink-0">
      <div className="px-5 py-6 border-b border-gray-700">
        <h1 className="text-xl font-bold text-white">CHME Admin</h1>
        <p className="text-xs text-gray-400 mt-0.5">관리자 대시보드</p>
      </div>
      <nav className="p-3 flex-1">
        {nav.map((item) => {
          const showHeader = item.section && item.section !== renderedSection;
          if (item.section) renderedSection = item.section;
          return (
            <div key={item.path}>
              {showHeader && (
                <p className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  {item.section}
                </p>
              )}
              <button
                onClick={() => navigate(item.path)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors ${
                  location.pathname.startsWith(item.path)
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                {item.label}
              </button>
            </div>
          );
        })}
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
  const rootAuth = getAuthContext();
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
            path="/forgot-password"
            element={
              <PublicOnlyRoute>
                <AdminForgotPasswordPage />
              </PublicOnlyRoute>
            }
          />

          <Route path="/admin/forbidden" element={<ForbiddenPage />} />

          <Route
            path="/"
            element={<Navigate to={rootAuth.authenticated ? defaultPath(rootAuth.groups) : '/login'} replace />}
          />

          <Route
            path="/admin/ops/dashboard"
            element={
              <RoleRoute roles={['admins', 'operators']}>
                <Layout>
                  <AdminOpsDashboardPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/audit/logs"
            element={
              <RoleRoute roles={['admins', 'operators']}>
                <Layout>
                  <AdminAuditLogsPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/quests/submissions"
            element={
              <RoleRoute roles={['admins', 'operators', 'creators']}>
                <Layout>
                  <AdminQuestSubmissionsPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/quests/proposals"
            element={
              <RoleRoute roles={['admins', 'operators', 'creators']}>
                <Layout>
                  <AdminQuestProposalsPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/challenges/create"
            element={
              <RoleRoute roles={['admins', 'creators']}>
                <Layout>
                  <AdminChallengeCreatePage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/challenges/all"
            element={
              <RoleRoute roles={['admins', 'operators']}>
                <Layout>
                  <AdminAllChallengesPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/challenges/mine"
            element={
              <RoleRoute roles={['admins', 'operators', 'creators']}>
                <Layout>
                  <AdminMyChallengesPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/notifications"
            element={
              <RoleRoute roles={['admins', 'operators']}>
                <Layout>
                  <AdminNotificationsPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/category-banners"
            element={
              <RoleRoute roles={['admins', 'operators']}>
                <Layout>
                  <AdminCategoryBannersPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/plaza"
            element={
              <RoleRoute roles={['admins', 'operators']}>
                <Layout>
                  <AdminPlazaPostPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/reports"
            element={
              <RoleRoute roles={['admins', 'operators']}>
                <Layout>
                  <AdminReportsPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/disband-requests"
            element={
              <RoleRoute roles={['admins', 'operators']}>
                <Layout>
                  <AdminDisbandRequestsPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/cheer/monitor"
            element={
              <RoleRoute roles={['admins', 'operators']}>
                <Layout>
                  <AdminCheerMonitorPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/commerce/coupons"
            element={
              <RoleRoute roles={['admins']}>
                <Layout>
                  <AdminCommerceCouponsPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/commerce/orders"
            element={
              <RoleRoute roles={['admins']}>
                <Layout>
                  <AdminCommerceOrdersPage />
                </Layout>
              </RoleRoute>
            }
          />

          <Route
            path="/admin/commerce/settlements"
            element={
              <RoleRoute roles={['admins']}>
                <Layout>
                  <AdminCommerceSettlementsPage />
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
