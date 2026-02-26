import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

function parseJwt(token: string): any {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}

export const AdminMyChallengesPage = () => {
  const token = localStorage.getItem('accessToken') || '';
  const payload = parseJwt(token);
  const mySub = payload?.sub as string | undefined;

  const [selectedChallengeId, setSelectedChallengeId] = useState<string>('');

  const { data: challengesData, isLoading, error } = useQuery({
    queryKey: ['admin-my-challenges', mySub],
    queryFn: async () => {
      const res = await apiClient.get('/admin/challenges/mine');
      return res.data?.data?.challenges ?? [];
    },
  });

  const filteredChallenges = challengesData ?? [];

  const selectedChallenge = filteredChallenges.find((c: any) => c.challengeId === selectedChallengeId) ?? null;

  const { data: questsData, isLoading: questsLoading } = useQuery({
    queryKey: ['admin-challenge-quests', selectedChallengeId],
    enabled: Boolean(selectedChallengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/quests?challengeId=${selectedChallengeId}&status=active`);
      return res.data?.data?.quests ?? [];
    },
  });

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">내 챌린지/퀘스트 관리 목록</h1>
        <p className="text-sm text-gray-600 mt-1">
          생성자 본인 기준으로 생성한 챌린지만 조회됩니다.
        </p>
      </div>

      {isLoading && <div className="text-sm text-gray-500">챌린지 목록을 불러오는 중...</div>}
      {error && <div className="text-sm text-red-600">챌린지 목록 조회에 실패했습니다.</div>}

      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">챌린지 선택</label>
        <select
          value={selectedChallengeId}
          onChange={(e) => setSelectedChallengeId(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl"
        >
          <option value="">챌린지를 선택하세요</option>
          {filteredChallenges.map((c: any) => (
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
