import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { lifecycleLabel, transitionLabel } from '@/utils/lifecycle';

type Lifecycle = 'draft' | 'recruiting' | 'preparing' | 'active' | 'completed' | 'archived';

type VerificationType = 'image' | 'text' | 'link' | 'video';

const VERIFICATION_TYPE_OPTIONS: { value: VerificationType; label: string }[] = [
  { value: 'image', label: '📸 사진' },
  { value: 'text',  label: '✍️ 텍스트' },
  { value: 'link',  label: '🔗 URL' },
  { value: 'video', label: '🎥 영상' },
];

type Quest = {
  questId: string;
  title: string;
  description: string;
  verificationType: string;
  rewardPoints: number;
  displayOrder: number;
};

const ALLOWED_TRANSITIONS: Record<Lifecycle, Lifecycle[]> = {
  draft: ['recruiting', 'archived'],
  recruiting: ['preparing', 'archived'],
  preparing: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

export const AdminAllChallengesPage = () => {
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [submittedReason, setSubmittedReason] = useState('');
  const [transitionReason, setTransitionReason] = useState('응급 운영 상태 변경');
  const [transitionLoading, setTransitionLoading] = useState<Lifecycle | null>(null);

  const [editingQuestId, setEditingQuestId] = useState('');
  const [questEditForm, setQuestEditForm] = useState({ title: '', description: '', rewardPoints: 0, displayOrder: 0 });
  const [questSaving, setQuestSaving] = useState(false);

  const [editingVerificationTypes, setEditingVerificationTypes] = useState(false);
  const [verificationTypeForm, setVerificationTypeForm] = useState<VerificationType[]>([]);
  const [verificationTypeSaving, setVerificationTypeSaving] = useState(false);

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

  useEffect(() => {
    if (!submittedReason) return;
    void refetch();
  }, [submittedReason, refetch]);

  const selectedChallenge = (challengesData ?? []).find((c: any) => c.challengeId === selectedChallengeId) ?? null;
  const currentLifecycle = (selectedChallenge?.lifecycle ?? null) as Lifecycle | null;

  const { data: questsData, isLoading: questsLoading, refetch: refetchQuests } = useQuery({
    queryKey: ['admin-all-challenge-quests', selectedChallengeId],
    enabled: Boolean(selectedChallengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/quests?challengeId=${selectedChallengeId}&status=active`);
      return res.data?.data?.quests ?? [];
    },
  });

  const nextLifecycles = useMemo(
    () => (currentLifecycle ? ALLOWED_TRANSITIONS[currentLifecycle] : []),
    [currentLifecycle],
  );

  const handleStartEditVerificationTypes = () => {
    const current: VerificationType[] = Array.isArray(selectedChallenge?.allowedVerificationTypes) && selectedChallenge.allowedVerificationTypes.length > 0
      ? selectedChallenge.allowedVerificationTypes
      : ['image', 'text', 'link', 'video'];
    setVerificationTypeForm(current);
    setEditingVerificationTypes(true);
  };

  const handleSaveVerificationTypes = async () => {
    if (!selectedChallengeId || verificationTypeForm.length === 0) return;
    setVerificationTypeSaving(true);
    try {
      await apiClient.put(`/admin/challenges/${selectedChallengeId}`, {
        allowedVerificationTypes: verificationTypeForm,
      });
      await refetch();
      setEditingVerificationTypes(false);
      alert('인증 유형 제한이 저장되었습니다.');
    } catch (e: any) {
      alert(e?.response?.data?.message || '저장에 실패했습니다.');
    } finally {
      setVerificationTypeSaving(false);
    }
  };

  const toggleVerificationType = (v: VerificationType) => {
    setVerificationTypeForm(prev =>
      prev.includes(v) ? prev.filter(t => t !== v) : [...prev, v]
    );
  };

  const handleSearch = () => {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) return;

    setSelectedChallengeId('');
    setEditingQuestId('');
    setSubmittedReason(trimmedReason);
  };

  const handleLifecycleTransition = async (target: Lifecycle) => {
    if (!selectedChallengeId || !transitionReason.trim()) return;
    setTransitionLoading(target);
    try {
      await apiClient.put(`/admin/challenges/${selectedChallengeId}/lifecycle`, {
        lifecycle: target,
        reason: transitionReason.trim(),
      });
      await refetch();
      alert(`챌린지 상태를 '${lifecycleLabel(target)}'으로 변경했습니다.`);
    } catch (e: any) {
      alert(e?.response?.data?.message || '챌린지 상태 변경에 실패했습니다.');
    } finally {
      setTransitionLoading(null);
    }
  };

  const startEditQuest = (quest: Quest) => {
    setEditingQuestId(quest.questId);
    setQuestEditForm({
      title: quest.title ?? '',
      description: quest.description ?? '',
      rewardPoints: Number(quest.rewardPoints ?? 0),
      displayOrder: Number(quest.displayOrder ?? 0),
    });
  };

  const saveQuest = async () => {
    if (!editingQuestId) return;
    setQuestSaving(true);
    try {
      await apiClient.put(`/admin/quests/${editingQuestId}`, {
        title: questEditForm.title.trim(),
        description: questEditForm.description.trim(),
        rewardPoints: Number(questEditForm.rewardPoints),
        displayOrder: Number(questEditForm.displayOrder),
      });
      await refetchQuests();
      setEditingQuestId('');
      alert('퀘스트 정보를 수정했습니다.');
    } catch (e: any) {
      alert(e?.response?.data?.message || '퀘스트 수정에 실패했습니다.');
    } finally {
      setQuestSaving(false);
    }
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
        {reason.trim().length > 0 && reason.trim().length < 5 && <p className="text-xs text-red-700">사유를 5자 이상 입력해주세요.</p>}
      </div>

      {isLoading && <div className="text-sm text-gray-500">챌린지 목록을 불러오는 중...</div>}
      {error && <div className="text-sm text-red-600">챌린지 목록 조회에 실패했습니다. (사유 입력 필요 여부를 확인하세요)</div>}

      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">챌린지 선택</label>
        <select
          value={selectedChallengeId}
          onChange={(e) => {
            setSelectedChallengeId(e.target.value);
            setEditingQuestId('');
            setEditingVerificationTypes(false);
          }}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl"
        >
          <option value="">챌린지를 선택하세요</option>
          {(challengesData ?? []).map((c: any) => (
            <option key={c.challengeId} value={c.challengeId}>
              {c.title} ({lifecycleLabel(c.lifecycle)})
            </option>
          ))}
        </select>
      </div>

      {selectedChallenge && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <h2 className="text-lg font-bold text-gray-900">{selectedChallenge.title}</h2>
          <p className="text-sm text-gray-600">상태: {lifecycleLabel(selectedChallenge.lifecycle)}</p>
          <p className="text-sm text-gray-600">생성자 ID: {selectedChallenge.createdBy || '-'}</p>
          <p className="text-sm text-gray-600">생성자 이름: {selectedChallenge.createdByName || '-'}</p>
          <p className="text-sm text-gray-600">챌린지 ID: {selectedChallenge.challengeId}</p>

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-orange-900">인증 유형 제한</p>
              <span className="text-xs text-orange-700">
                현재: {(Array.isArray(selectedChallenge.allowedVerificationTypes) && selectedChallenge.allowedVerificationTypes.length > 0
                  ? selectedChallenge.allowedVerificationTypes
                  : ['image', 'text', 'link', 'video']
                ).join(', ')}
              </span>
            </div>
            {editingVerificationTypes ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {VERIFICATION_TYPE_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={verificationTypeForm.includes(opt.value)}
                        onChange={() => toggleVerificationType(opt.value)}
                        className="rounded"
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
                {verificationTypeForm.length === 0 && (
                  <p className="text-xs text-red-600">최소 1가지 유형을 선택해야 합니다.</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveVerificationTypes}
                    disabled={verificationTypeSaving || verificationTypeForm.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-orange-600 text-white text-sm disabled:opacity-50"
                  >
                    {verificationTypeSaving ? '저장 중...' : '저장'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingVerificationTypes(false)}
                    className="px-3 py-1.5 rounded-lg bg-gray-300 text-gray-800 text-sm"
                  >
                    취소
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={handleStartEditVerificationTypes}
                className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-sm"
              >
                인증 유형 수정
              </button>
            )}
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
            <p className="text-sm font-semibold text-indigo-900">응급 상태 변경</p>
            <input
              value={transitionReason}
              onChange={(e) => setTransitionReason(e.target.value)}
              className="w-full px-3 py-2 border border-indigo-200 rounded-lg"
              placeholder="상태 변경 사유"
            />
            <div className="flex flex-wrap gap-2">
              {nextLifecycles.length === 0 && <p className="text-xs text-gray-500">전환 가능한 다음 상태가 없습니다.</p>}
              {nextLifecycles.map((lc) => (
                <button
                  key={lc}
                  type="button"
                  onClick={() => handleLifecycleTransition(lc)}
                  disabled={transitionLoading !== null || transitionReason.trim().length < 3}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50"
                >
                  {transitionLoading === lc ? '변경 중...' : transitionLabel(lc)}
                </button>
              ))}
            </div>
          </div>
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
              {(questsData as Quest[]).map((q) => (
                <div key={q.questId} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <p className="font-semibold text-gray-900">{q.title}</p>
                  <p className="text-sm text-gray-600">{q.description}</p>
                  <p className="text-xs text-gray-500 mt-1">유형: {q.verificationType} · 포인트: {q.rewardPoints} · 순서: {q.displayOrder}</p>

                  {editingQuestId === q.questId ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-gray-50 rounded-lg p-2">
                      <input
                        value={questEditForm.title}
                        onChange={(e) => setQuestEditForm((prev) => ({ ...prev, title: e.target.value }))}
                        className="px-2 py-1.5 border rounded"
                        placeholder="퀘스트 제목"
                      />
                      <input
                        type="number"
                        value={questEditForm.rewardPoints}
                        onChange={(e) => setQuestEditForm((prev) => ({ ...prev, rewardPoints: Number(e.target.value) }))}
                        className="px-2 py-1.5 border rounded"
                        placeholder="포인트"
                      />
                      <input
                        type="number"
                        value={questEditForm.displayOrder}
                        onChange={(e) => setQuestEditForm((prev) => ({ ...prev, displayOrder: Number(e.target.value) }))}
                        className="px-2 py-1.5 border rounded"
                        placeholder="순서"
                      />
                      <input
                        value={questEditForm.description}
                        onChange={(e) => setQuestEditForm((prev) => ({ ...prev, description: e.target.value }))}
                        className="px-2 py-1.5 border rounded"
                        placeholder="설명"
                      />
                      <div className="flex gap-2 md:col-span-2">
                        <button
                          type="button"
                          onClick={saveQuest}
                          disabled={questSaving || !questEditForm.title.trim() || !questEditForm.description.trim()}
                          className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
                        >
                          {questSaving ? '저장 중...' : '저장'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingQuestId('')}
                          className="px-3 py-1.5 rounded bg-gray-300 text-gray-800 text-sm"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditQuest(q)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm"
                    >
                      퀘스트 수정
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
