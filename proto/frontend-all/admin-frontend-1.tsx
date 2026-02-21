// admin-frontend/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';

// Pages
import { AdminLoginPage } from './pages/AdminLoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChallengeManagePage } from './pages/ChallengeManagePage';
import { UserManagePage } from './pages/UserManagePage';
import { AdminLayout } from './layouts/AdminLayout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isAdmin } = useAuthStore();
  
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <div className="p-8 text-center">관리자 권한이 필요합니다</div>;
  
  return <>{children}</>;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AdminLoginPage />} />
          
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="challenges" element={<ChallengeManagePage />} />
            <Route path="users" element={<UserManagePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

// admin-frontend/src/store/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  isAuthenticated: boolean;
  isAdmin: boolean;
  user: any;
  accessToken: string | null;
  setAuth: (user: any, accessToken: string, groups: string[]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      isAdmin: false,
      user: null,
      accessToken: null,

      setAuth: (user, accessToken, groups) => {
        const isAdmin = groups.includes('admins');
        localStorage.setItem('accessToken', accessToken);
        set({
          isAuthenticated: true,
          isAdmin,
          user,
          accessToken,
        });
      },

      logout: () => {
        localStorage.clear();
        set({
          isAuthenticated: false,
          isAdmin: false,
          user: null,
          accessToken: null,
        });
      },
    }),
    { name: 'admin-auth-storage' }
  )
);

// admin-frontend/src/pages/AdminLoginPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CognitoIdentityProviderClient, InitiateAuthCommand, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { useAuthStore } from '../store/authStore';

const cognitoClient = new CognitoIdentityProviderClient({ 
  region: import.meta.env.VITE_AWS_REGION 
});

export const AdminLoginPage = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Cognito 로그인
      const authResult = await cognitoClient.send(new InitiateAuthCommand({
        ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID!,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: formData.email,
          PASSWORD: formData.password,
        },
      }));

      if (!authResult.AuthenticationResult) {
        throw new Error('인증 실패');
      }

      const accessToken = authResult.AuthenticationResult.AccessToken!;

      // 2. 사용자 정보 및 그룹 조회
      const userResult = await cognitoClient.send(new GetUserCommand({
        AccessToken: accessToken,
      }));

      const groups = userResult.UserAttributes?.find(attr => attr.Name === 'cognito:groups')?.Value?.split(',') || [];

      // 3. admins 그룹 확인
      if (!groups.includes('admins')) {
        setError('관리자 권한이 없습니다');
        setLoading(false);
        return;
      }

      // 4. 로그인 완료
      const user = {
        email: formData.email,
        username: userResult.Username,
      };

      setAuth(user, accessToken, groups);
      navigate('/');

    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || '로그인에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">CHME Admin</h1>
          <p className="text-gray-600">관리자 로그인</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              이메일
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              비밀번호
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
};

// admin-frontend/src/pages/DashboardPage.tsx
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { FiUsers, FiTarget, FiActivity } from 'react-icons/fi';

export const DashboardPage = () => {
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const response = await apiClient.get('/admin/stats/overview');
      return response.data.data;
    },
  });

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">대시보드</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <FiUsers className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-1">전체 사용자</p>
          <p className="text-3xl font-bold text-gray-900">{stats?.totalUsers || 0}</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <FiTarget className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-1">전체 챌린지</p>
          <p className="text-3xl font-bold text-gray-900">{stats?.totalChallenges || 0}</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <FiActivity className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-1">총 참여 수</p>
          <p className="text-3xl font-bold text-gray-900">{stats?.totalParticipations || 0}</p>
        </div>
      </div>
    </div>
  );
};
