import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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

type VerificationType = 'image' | 'video' | 'link' | 'text';
type QuestLayer = 'A' | 'B' | 'D';
type QuestScope = 'leader' | 'personal' | 'mixed';
type QuestFormState = {
  title: string;
  description: string;
  allowedVerificationTypes: VerificationType[];
  verificationGuide: string;
  rewardPoints: number;
  displayOrder: number;
  questLayer: QuestLayer;
  questScope: QuestScope;
};
const EMPTY_QUEST_FORM: QuestFormState = {
  title: '',
  description: '',
  allowedVerificationTypes: ['image'],
  verificationGuide: '',
  rewardPoints: 1,
  displayOrder: 0,
  questLayer: 'A',
  questScope: 'leader',
};
const VERIFICATION_TYPES: VerificationType[] = ['image', 'video', 'link', 'text'];

const ALLOWED_TRANSITIONS: Record<Lifecycle, Lifecycle[]> = {
  draft: ['recruiting', 'archived'],
  recruiting: ['preparing', 'archived'],
  preparing: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

export const AdminMyChallengesPage = () => {
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>('');
  const [transitionReason, setTransitionReason] = useState('운영 정책에 따른 상태 전환');
  const [transitionLoading, setTransitionLoading] = useState<Lifecycle | null>(null);

  const [previewDraft, setPreviewDraft] = useState('');
  const [boardDraft, setBoardDraft] = useState('');
  const [previewSaving, setPreviewSaving] = useState(false);
  const [boardSaving, setBoardSaving] = useState(false);
  const [previewHasNonText, setPreviewHasNonText] = useState(false);
  const [boardHasNonText, setBoardHasNonText] = useState(false);

  // 퀘스트 생성/수정 폼 상태
  const [questFormOpen, setQuestFormOpen] = useState(false);
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null);
  const [questForm, setQuestForm] = useState<QuestFormState>(EMPTY_QUEST_FORM);
  const [questSaving, setQuestSaving] = useState(false);

  const { data: challengesData, isLoading, error, refetch: refetchChallenges } = useQuery({
    queryKey: ['admin-my-challenges'],
    queryFn: async () => {
      const res = await apiClient.get('/adm/challenges/mine');
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
      const res = await apiClient.get(`/c/${selectedChallengeId}/quests?status=active`);
      return res.data?.data?.quests ?? [];
    },
  });


  const { data: previewData, refetch: refetchPreview } = useQuery({
    queryKey: ['admin-preview-board', selectedChallengeId],
    enabled: Boolean(selectedChallengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/public/board/${selectedChallengeId}/preview`);
      return res.data;
    },
  });

  const { data: challengeBoardData, refetch: refetchChallengeBoard } = useQuery({
    queryKey: ['admin-challenge-board', selectedChallengeId],
    enabled: Boolean(selectedChallengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/s/board/${selectedChallengeId}`);
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
      await apiClient.post(`/s/board/${selectedChallengeId}/preview`, { blocks: toTextBlocks(previewDraft) });
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
      await apiClient.post(`/s/board/${selectedChallengeId}`, { blocks: toTextBlocks(boardDraft) });
      await refetchChallengeBoard();
      alert('챌린지 보드를 저장했습니다.');
    } catch (e: any) {
      alert(e?.response?.data?.message || '챌린지 보드 저장에 실패했습니다.');
    } finally {
      setBoardSaving(false);
    }
  };


  const openQuestCreate = () => {
    setEditingQuestId(null);
    setQuestForm(EMPTY_QUEST_FORM);
    setQuestFormOpen(true);
  };

  const openQuestEdit = (q: any) => {
    setEditingQuestId(q.questId);
    setQuestForm({
      title: q.title ?? '',
      description: q.description ?? '',
      allowedVerificationTypes:
        (q.allowedVerificationTypes as VerificationType[] | undefined) ??
        (q.verificationType ? [q.verificationType as VerificationType] : ['image']),
      verificationGuide: q.verificationGuide ?? '',
      rewardPoints: typeof q.rewardPoints === 'number' ? q.rewardPoints : 1,
      displayOrder: typeof q.displayOrder === 'number' ? q.displayOrder : 0,
      questLayer: (q.questLayer as QuestLayer) ?? 'A',
      questScope: (q.questScope as QuestScope) ?? 'leader',
    });
    setQuestFormOpen(true);
  };

  const toggleVerificationType = (t: VerificationType) => {
    setQuestForm((prev) => {
      const has = prev.allowedVerificationTypes.includes(t);
      const next = has
        ? prev.allowedVerificationTypes.filter((x) => x !== t)
        : [...prev.allowedVerificationTypes, t];
      return { ...prev, allowedVerificationTypes: next.length ? next : prev.allowedVerificationTypes };
    });
  };

  const submitQuest = async () => {
    if (!selectedChallengeId) return;
    if (!questForm.title.trim() || !questForm.description.trim()) {
      alert('제목과 설명을 입력하세요.');
      return;
    }
    if (questForm.allowedVerificationTypes.length === 0) {
      alert('인증 유형을 하나 이상 선택하세요.');
      return;
    }
    setQuestSaving(true);
    try {
      const payload = {
        title: questForm.title.trim(),
        description: questForm.description.trim(),
        allowedVerificationTypes: questForm.allowedVerificationTypes,
        verificationGuide: questForm.verificationGuide.trim() || undefined,
        rewardPoints: questForm.rewardPoints,
        displayOrder: questForm.displayOrder,
        questLayer: questForm.questLayer,
        questScope: questForm.questScope,
      };
      if (editingQuestId) {
        await apiClient.put(`/adm/quests/${editingQuestId}`, payload);
        alert('퀘스트를 수정했습니다.');
      } else {
        await apiClient.post('/adm/quests', { ...payload, challengeId: selectedChallengeId });
        alert('퀘스트를 생성했습니다.');
      }
      setQuestFormOpen(false);
      setEditingQuestId(null);
      await refetchQuests();
    } catch (e: any) {
      alert(e?.response?.data?.message || '퀘스트 저장에 실패했습니다.');
    } finally {
      setQuestSaving(false);
    }
  };

  const handleLifecycleTransition = async (target: Lifecycle) => {
    if (!selectedChallengeId || !transitionReason.trim()) return;
    setTransitionLoading(target);
    try {
      await apiClient.put(`/adm/challenges/${selectedChallengeId}/lifecycle`, {
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
          onChange={(e) => setSelectedChallengeId(e.target.value)}
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
              onClick={openQuestCreate}
              className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"
            >
              + 퀘스트 추가
            </button>
          </div>

          {questFormOpen && (
            <div className="mb-4 border border-primary-200 bg-primary-50/40 rounded-xl p-4 space-y-3">
              <p className="font-semibold text-gray-900">{editingQuestId ? '퀘스트 수정' : '퀘스트 생성'}</p>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="퀘스트 제목"
                value={questForm.title}
                onChange={(e) => setQuestForm((p) => ({ ...p, title: e.target.value }))}
              />
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="퀘스트 설명"
                rows={3}
                value={questForm.description}
                onChange={(e) => setQuestForm((p) => ({ ...p, description: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                {VERIFICATION_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleVerificationType(t)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                      questForm.allowedVerificationTypes.includes(t)
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-600 border-gray-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="인증 가이드(선택)"
                value={questForm.verificationGuide}
                onChange={(e) => setQuestForm((p) => ({ ...p, verificationGuide: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-600">
                  보상 포인트
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={questForm.rewardPoints}
                    onChange={(e) => setQuestForm((p) => ({ ...p, rewardPoints: Number(e.target.value) || 0 }))}
                  />
                </label>
                <label className="text-xs text-gray-600">
                  표시 순서
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={questForm.displayOrder}
                    onChange={(e) => setQuestForm((p) => ({ ...p, displayOrder: Number(e.target.value) || 0 }))}
                  />
                </label>
                <label className="text-xs text-gray-600">
                  레이어
                  <select
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={questForm.questLayer}
                    onChange={(e) => setQuestForm((p) => ({ ...p, questLayer: e.target.value as QuestLayer }))}
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="D">D</option>
                  </select>
                </label>
                <label className="text-xs text-gray-600">
                  스코프
                  <select
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={questForm.questScope}
                    onChange={(e) => setQuestForm((p) => ({ ...p, questScope: e.target.value as QuestScope }))}
                  >
                    <option value="leader">leader</option>
                    <option value="personal">personal</option>
                    <option value="mixed">mixed</option>
                  </select>
                </label>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setQuestFormOpen(false); setEditingQuestId(null); }}
                  className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-sm font-semibold"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={submitQuest}
                  disabled={questSaving}
                  className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {questSaving ? '저장 중...' : editingQuestId ? '수정 저장' : '생성'}
                </button>
              </div>
            </div>
          )}

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
                    <div className="flex items-center gap-2">
                      {q.status && q.status !== 'active' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{q.status}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => openQuestEdit(q)}
                        className="text-xs px-2 py-0.5 rounded-full border border-primary-300 text-primary-700 hover:bg-primary-50"
                      >
                        수정
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">{q.description}</p>
                  <p className="text-xs text-gray-500">
                    유형: {q.verificationType} · 포인트: {q.rewardPoints} · 순서: {q.displayOrder}
                    {(q as any).questLayer ? ` · 레이어: ${(q as any).questLayer}` : ''}
                    {(q as any).questScope ? ` · 스코프: ${(q as any).questScope}` : ''}
                    {(q as any).startDay || (q as any).endDay ? ` · Day ${(q as any).startDay ?? '?'}~${(q as any).endDay ?? '?'}` : ''}
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
