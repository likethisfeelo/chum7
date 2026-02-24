import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminQuestCreatePage } from '@/pages/AdminQuestCreatePage';
import { AdminQuestSubmissionsPage } from '@/pages/AdminQuestSubmissionsPage';
import '@/styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 } },
});

const NAV = [
  { path: '/admin/quests/submissions', label: '📋 제출물 심사' },
  { path: '/admin/quests/create',      label: '➕ 퀘스트 생성' },
];

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-white flex flex-col flex-shrink-0">
      <div className="px-5 py-6 border-b border-gray-700">
        <h1 className="text-xl font-bold text-white">CHME Admin</h1>
        <p className="text-xs text-gray-400 mt-0.5">관리자 대시보드</p>
      </div>
      <nav className="p-3 flex-1">
        {NAV.map(item => (
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
    </aside>
  );
};

const Layout = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen bg-gray-50">
    <Sidebar />
    <main className="flex-1 overflow-auto">
      {children}
    </main>
  </div>
);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/admin/quests/submissions" replace />} />
          <Route
            path="/admin/quests/submissions"
            element={<Layout><AdminQuestSubmissionsPage /></Layout>}
          />
          <Route
            path="/admin/quests/create"
            element={<Layout><AdminQuestCreatePage /></Layout>}
          />
          <Route path="*" element={<Navigate to="/admin/quests/submissions" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
