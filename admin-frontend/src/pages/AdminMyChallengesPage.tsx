import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { lifecycleLabel, transitionLabel } from '@/utils/lifecycle';

type Lifecycle = 'draft' | 'recruiting' | 'preparing' | 'active' | 'completed' | 'archived';

type Quest = {
  questId: string;
  title: string;
  description: string;
  verificationType: string;
  rewardPoints: number;
  displayOrder: number;
  status?: string;
  endAt?: string | null;
};

const ALLOWED_TRANSITIONS: Record<Lifecycle, Lifecycle[]> = {
  draft: ['recruiting', 'archived'],
  recruiting: ['preparing', 'archived'],
  preparing: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

export const AdminMyChallengesPage = () => {
  const navigate = useNavigate();
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>('');
  const [transitionReason, setTransitionReason] = useState('운영 정책에 따른 상태 전환');
  const [transitionLoading, setTransitionLoading] = useState<Lifecycle | null>(null);

  const [editingQuestId, setEditingQuestId] = useState<string>('');
  const [questEditForm, setQuestEditForm] = useState({ title: '', description: '', rewardPoints: 0, displayOrder: 0 });
  const [questSaving, setQuestSaving] = useState(false);

  const [previewDraft, setPreviewDraft] = useState('');
  const [boardDraft, setBoardDraft] = useState('');
  const [previewSaving, setPreviewSaving] = useState(false);
  const [boardSaving, setBoardSaving] = useState(false);
  const [previewHasNonText, setPreviewHasNonText] = useState(false);
  const [boardHasNonText, setBoardHasNonText] = useState(false);

  const { data: challengesData, isLoading, error, refetch: refetchChallenges } = useQuery({
    queryKey: ['admin-my-challenges'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/challenges/mine');
      return res.data?.data?.challenges ?? [];
    },
  });

  const filteredChallenges = challengesData ?? [];
  const selectedChallenge = filteredChallenges.find((c: any) => c.challengeId === selectedChallengeId) ?? null;
  const currentLifecycle = (selectedChallenge?.lifecycle ?? null) as Lifecycle | null;
  const isBoardEditingLocked = currentLifecycle === 'active' || currentLifecycle === 'completed' || currentLifecycle === 'archived';

  const { data: questsData, isLoading: questsLoading, refetch: refetchQuests } = useQuery({
    queryKey: ['admin-challenge-quests', selectedChallengeId],
    enabled: Boolean(selectedChallengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/quests?challengeId=${selectedChallengeId}&status=active`);
      return res.data?.data?.quests ?? [];
    },
  });


  const { data: previewData, refetch: refetchPreview } = useQuery({
    queryKey: ['admin-preview-board', selectedChallengeId],
    enabled: Boolean(selectedChallengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/preview-board/${selectedChallengeId}`);
      return res.data;
    },
  });

  const { data: challengeBoardData, refetch: refetchChallengeBoard } = useQuery({
    queryKey: ['admin-challenge-board', selectedChallengeId],
    enabled: Boolean(selectedChallengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/challenge-board/${selectedChallengeId}`);
      return res.data;
    },
  });

  const nextLifecycles = useMemo(
    () => (currentLifecycle ? ALLOWED_TRANSITIONS[currentLifecycle] : []),
    [currentLifecycle],
  );

  useEffect(() => {
    const blocks = previewData?.blocks || [];
    const previewText = blocks
      .filter((b: any) => b.type === 'text' && typeof b.content === 'string')
      .map((b: any) => b.content)
      .join('\n\n');
    setPreviewDraft(previewText);
    setPreviewHasNonText(blocks.some((b: any) => b.type !== 'text'));
  }, [previewData]);

  useEffect(() => {
    const blocks = challengeBoardData?.blocks || [];
    const boardText = blocks
      .filter((b: any) => b.type === 'text' && typeof b.content === 'string')
      .map((b: any) => b.content)
      .join('\n\n');
    setBoardDraft(boardText);
    setBoardHasNonText(blocks.some((b: any) => b.type !== 'text'));
  }, [challengeBoardData]);

  const toTextBlocks = (raw: string) =>
    raw
      .split(/\n{2,}/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((content, idx) => ({ id: `t-${idx + 1}-${Date.now()}`, type: 'text', order: idx + 1, content }));

  const savePreviewBoard = async () => {
    if (!selectedChallengeId) return;
    if (isBoardEditingLocked) {
      alert('챌린지 시작 후에는 프리뷰/보드 수정이 원칙적으로 불가합니다.');
      return;
    }

    setPreviewSaving(true);
    try {
      await apiClient.post(`/preview-board/${selectedChallengeId}`, { blocks: toTextBlocks(previewDraft) });
      await refetchPreview();
      alert('프리뷰 보드를 저장했습니다.');
    } catch (e: any) {
      alert(e?.response?.data?.message || '프리뷰 보드 저장에 실패했습니다.');
    } finally {
      setPreviewSaving(false);
    }
  };

  const saveChallengeBoard = async () => {
    if (!selectedChallengeId) return;
    if (isBoardEditingLocked) {
      alert('챌린지 시작 후에는 프리뷰/보드 수정이 원칙적으로 불가합니다.');
      return;
    }

    setBoardSaving(true);
    try {
      await apiClient.post(`/challenge-board/${selectedChallengeId}`, { blocks: toTextBlocks(boardDraft) });
      await refetchChallengeBoard();
      alert('챌린지 보드를 저장했습니다.');
    } catch (e: any) {
      alert(e?.response?.data?.message || '챌린지 보드 저장에 실패했습니다.');
    } finally {
      setBoardSaving(false);
    }
  };


  const handleLifecycleTransition = async (target: Lifecycle) => {
    if (!selectedChallengeId || !transitionReason.trim()) return;
    setTransitionLoading(target);
    try {
      await apiClient.put(`/admin/challenges/${selectedChallengeId}/lifecycle`, {
        lifecycle: target,
        reason: transitionReason.trim(),
      });
      await refetchChallenges();
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
        <h1 className="text-2xl font-bold text-gray-900">내 챌린지/퀘스트 관리 목록</h1>
        <p className="text-sm text-gray-600 mt-1">생성자 본인 기준으로 생성한 챌린지만 조회됩니다.</p>
      </div>

      {isLoading && <div className="text-sm text-gray-500">챌린지 목록을 불러오는 중...</div>}
      {error && <div className="text-sm text-red-600">챌린지 목록 조회에 실패했습니다.</div>}

      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">챌린지 선택</label>
        <select
          value={selectedChallengeId}
          onChange={(e) => {
            setSelectedChallengeId(e.target.value);
            setEditingQuestId('');
          }}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-xl"
        >
          <option value="">챌린지를 선택하세요</option>
          {filteredChallenges.map((c: any) => (
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

          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
            <p className="text-sm font-semibold text-indigo-900">챌린지 상태 변경</p>
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
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">챌린지 프리뷰/보드 내용 관리</h3>
            <p className="text-sm text-gray-600">챌린지 생성 시 비워둘 수 있으며, 이후 추가/수정 가능합니다. (preparing까지 허용, active부터 원칙적 수정불가)</p>
            {isBoardEditingLocked && <p className="text-xs text-rose-600 mt-1">현재 상태: {lifecycleLabel(currentLifecycle!)} · 읽기 전용</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-xl p-3 space-y-2">
              <p className="font-semibold text-gray-900">프리뷰 보드 (공개)</p>
              {previewHasNonText && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠️ 이 보드에는 이미지/링크 블록이 포함되어 있습니다. 텍스트 편집기에서 저장하면 해당 블록이 사라집니다.
                </div>
              )}
              <textarea
                value={previewDraft}
                onChange={(e) => setPreviewDraft(e.target.value)}
                disabled={isBoardEditingLocked || previewSaving}
                className="w-full min-h-[180px] px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="문단을 빈 줄로 구분해 텍스트 블록으로 저장됩니다."
              />
              <button
                type="button"
                onClick={savePreviewBoard}
                disabled={isBoardEditingLocked || previewSaving}
                className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
              >
                {previewSaving ? '저장 중...' : '프리뷰 저장'}
              </button>
            </div>

            <div className="border border-gray-200 rounded-xl p-3 space-y-2">
              <p className="font-semibold text-gray-900">챌린지 보드 (참여자 전용)</p>
              {boardHasNonText && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠️ 이 보드에는 이미지/링크 블록이 포함되어 있습니다. 텍스트 편집기에서 저장하면 해당 블록이 사라집니다.
                </div>
              )}
              <textarea
                value={boardDraft}
                onChange={(e) => setBoardDraft(e.target.value)}
                disabled={isBoardEditingLocked || boardSaving}
                className="w-full min-h-[180px] px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="문단을 빈 줄로 구분해 텍스트 블록으로 저장됩니다."
              />
              <button
                type="button"
                onClick={saveChallengeBoard}
                disabled={isBoardEditingLocked || boardSaving}
                className="px-3 py-1.5 rounded bg-slate-800 text-white text-sm disabled:opacity-50"
              >
                {boardSaving ? '저장 중...' : '보드 저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedChallengeId && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-900">챌린지별 퀘스트</h3>
            <button
              type="button"
              onClick={() => navigate(`/admin/quests/create?challengeId=${selectedChallengeId}`)}
              className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors"
            >
              + 퀘스트 추가
            </button>
          </div>
          {questsLoading ? (
            <p className="text-sm text-gray-500">퀘스트 목록을 불러오는 중...</p>
          ) : (questsData?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">등록된 활성 퀘스트가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {(questsData as Quest[]).map((q) => (
                <div key={q.questId} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <p className="font-semibold text-gray-900">{q.title}</p>
                    {q.status && q.status !== 'active' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{q.status}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{q.description}</p>
                  <p className="text-xs text-gray-500">
                    유형: {q.verificationType} · 포인트: {q.rewardPoints} · 순서: {q.displayOrder}
                    {(q as any).questLayer ? ` · 레이어: ${(q as any).questLayer}` : ''}
                    {(q as any).questScope ? ` · 스코프: ${(q as any).questScope}` : ''}
                    {(q as any).startDay || (q as any).endDay ? ` · Day ${(q as any).startDay ?? '?'}~${(q as any).endDay ?? '?'}` : ''}
                  </p>

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
