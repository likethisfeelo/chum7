import { useNavigate } from 'react-router-dom';

export const AdminAccessDeniedPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
        <p className="text-4xl">🚫</p>
        <h1 className="mt-3 text-xl font-bold text-gray-900">운영 권한이 필요합니다</h1>
        <p className="mt-2 text-sm text-gray-600">
          이 페이지는 운영자(Admin/Ops) 전용입니다. 권한이 필요하면 운영팀에 접근 요청해 주세요.
        </p>
        <button
          onClick={() => navigate('/me')}
          className="mt-4 inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          내 페이지로 이동
        </button>
      </div>
    </div>
  );
};
