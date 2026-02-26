import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export const AdminAllChallengesPage = () => {
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [submittedReason, setSubmittedReason] = useState('');

  const { data: challengesData, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-all-challenges', submittedReason],
    enabled: false,
    retry: false,
    queryFn: async () => {
      const query = submittedReason ? `?reason=${encodeURIComponent(submittedReason)}` : '';
      const res = await apiClient.get(`/admin/challenges/all${query}`);
      return res.data?.data?.challenges ?? [];
    },
  });

  const selectedChallenge = (challengesData ?? []).find((c: any) => c.challengeId === selectedChallengeId) ?? null;

  const { data: questsData, isLoading: questsLoading } = useQuery({
    queryKey: ['admin-all-challenge-quests', selectedChallengeId],
    enabled: Boolean(selectedChallengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/quests?challengeId=${selectedChallengeId}&status=active`);
      return res.data?.data?.quests ?? [];
    },
  });

  useEffect(() => {
    if (!submittedReason) return;
    void refetch();
  }, [submittedReason, refetch]);

  const handleSearch = () => {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) return;

    setSelectedChallengeId('');
    setSubmittedReason(trimmedReason);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">전체 챌린지/퀘스트 조회</h1>
        <p className="text-sm text-gray-600 mt-1">admins 전용 응급운영 화면입니다.</p>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
        <h2 className="text-sm font-bold text-red-900">🚨 응급운영 관리자 가이드 (admins only)</h2>
        <ul className="list-disc pl-5 text-sm text-red-800 space-y-1">
          <li>이 화면은 장애/보안/운영 이슈 대응 시에만 사용합니다.</li>
          <li>조회 전 사유를 구체적으로 입력해야 하며, 입력 사유는 감사 로그로 기록됩니다.</li>
          <li>백엔드 연결 필수: <code className="font-mono">GET /admin/challenges/all</code> 라우트가 API Gateway에 매핑되어야 합니다.</li>
          <li>응급 조치 후에는 일반 운영 화면(내 챌린지/퀘스트)으로 복귀해주세요.</li>
        </ul>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
        <label className="block text-sm font-medium text-amber-900">전체 조회 사유 (admins 필수)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 운영 장애 대응을 위한 전체 현황 점검"
          className="w-full px-3 py-2.5 border border-amber-300 rounded-xl"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={reason.trim().length < 5 || isLoading}
          className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          전체 조회 실행
        </button>
        {reason.trim().length > 0 && reason.trim().length < 5 && (
          <p className="text-xs text-red-700">사유를 5자 이상 입력해주세요.</p>
        )}
      </div>

      {isLoading && <div className="text-sm text-gray-500">챌린지 목록을 불러오는 중...</div>}
      {error && <div className="text-sm text-red-600">챌린지 목록 조회에 실패했습니다. (사유 입력 필요 여부를 확인하세요)</div>}

      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">챌린지 선택</label>
        <select
          value={selectedChallengeId}
          onChange={(e) => setSelectedChallengeId(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl"
        >
          <option value="">챌린지를 선택하세요</option>
          {(challengesData ?? []).map((c: any) => (
            <option key={c.challengeId} value={c.challengeId}>
              {c.title} ({c.lifecycle})
            </option>
          ))}
        </select>
      </div>

      {selectedChallenge && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-2">
          <h2 className="text-lg font-bold text-gray-900">{selectedChallenge.title}</h2>
          <p className="text-sm text-gray-600">상태: {selectedChallenge.lifecycle}</p>
          <p className="text-sm text-gray-600">생성자 ID: {selectedChallenge.createdBy || '-'}</p>
          <p className="text-sm text-gray-600">생성자 이름: {selectedChallenge.createdByName || '-'}</p>
          <p className="text-sm text-gray-600">챌린지 ID: {selectedChallenge.challengeId}</p>
        </div>
      )}

      {selectedChallengeId && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-lg font-bold text-gray-900 mb-3">챌린지별 퀘스트</h3>
          {questsLoading ? (
            <p className="text-sm text-gray-500">퀘스트 목록을 불러오는 중...</p>
          ) : (questsData?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">등록된 활성 퀘스트가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {questsData.map((q: any) => (
                <div key={q.questId} className="border border-gray-200 rounded-xl p-3">
                  <p className="font-semibold text-gray-900">{q.title}</p>
                  <p className="text-sm text-gray-600">{q.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    유형: {q.verificationType} · 포인트: {q.rewardPoints} · 순서: {q.displayOrder}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
