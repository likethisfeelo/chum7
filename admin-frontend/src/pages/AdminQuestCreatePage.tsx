import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';

type VerificationType = 'image' | 'link' | 'text' | 'video';
type QuestLayer = 'A' | 'B' | 'D';
type QuestScope = 'leader' | 'personal' | 'mixed';

const VERIFICATION_TYPES: { value: VerificationType; label: string }[] = [
  { value: 'image', label: '📸 사진' },
  { value: 'link',  label: '🔗 URL' },
  { value: 'text',  label: '✍️ 텍스트' },
  { value: 'video', label: '🎥 영상' },
];

const INITIAL = {
  title:           '',
  description:     '',
  icon:            '📋',
  rewardPoints:    100,
  verificationType: 'image' as VerificationType,
  approvalRequired: true,
  displayOrder:    0,
  startAt:         '',
  endAt:           '',
  linkExample:     '',
  linkPattern:     '',
  maxChars:        2000,
  questLayer:      'A' as QuestLayer,
  questScope:      'leader' as QuestScope,
  requireOnJoinInput: false,
  remedyType: 'open' as 'strict'|'limited'|'open',
  maxRemedyDays: 1,
  allowBulk: false,
  startDay: '',
  endDay: '',
  revealAt: '',
};

export const AdminQuestCreatePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialChallengeId = searchParams.get('challengeId') ?? '';

  const [challengeId, setChallengeId] = useState(initialChallengeId);
  const [form, setForm] = useState(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [challengeOptions, setChallengeOptions] = useState<Array<{ challengeId: string; title: string; lifecycle?: string; allowedVerificationTypes?: string[] }>>([]);
  const [challengeLoading, setChallengeLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadChallenges = async () => {
      setChallengeLoading(true);
      try {
        const res = await apiClient.get('/challenges?sortBy=latest&limit=100');
        const challenges = res.data?.data?.challenges ?? [];
        if (!mounted) return;
        setChallengeOptions(
          challenges
            .filter((challenge: any) => challenge?.challengeId)
            .map((challenge: any) => ({
              challengeId: challenge.challengeId,
              title: challenge.title ?? '제목 없음',
              lifecycle: challenge.lifecycle,
              allowedVerificationTypes: challenge.allowedVerificationTypes,
            }))
        );
      } catch {
        if (!mounted) return;
        setError('챌린지 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      } finally {
        if (mounted) setChallengeLoading(false);
      }
    };

    loadChallenges();
    return () => {
      mounted = false;
    };
  }, []);

  const set = <K extends keyof typeof INITIAL>(key: K, val: (typeof INITIAL)[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const selectedChallenge = challengeOptions.find(c => c.challengeId === challengeId);
  const allowedTypes: VerificationType[] = (selectedChallenge?.allowedVerificationTypes as VerificationType[] | undefined) ?? ['image', 'link', 'text', 'video'];

  useEffect(() => {
    if (challengeId && allowedTypes.length > 0 && !allowedTypes.includes(form.verificationType)) {
      set('verificationType', allowedTypes[0]);
    }
  }, [challengeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('제목을 입력해주세요'); return; }
    if (!challengeId.trim()) { setError('연결할 챌린지를 선택해주세요'); return; }

    setLoading(true);
    setError('');
    try {
      const payload: any = {
        title:            form.title.trim(),
        description:      form.description.trim(),
        verificationGuide: form.description.trim() || `${form.title.trim()} 인증을 제출해주세요.`,
        icon:             form.icon.trim() || '📋',
        rewardPoints:     Number(form.rewardPoints),
        verificationType: form.verificationType,
        approvalRequired: form.approvalRequired,
        displayOrder:     Number(form.displayOrder),
        questLayer:       form.questLayer,
        questScope:       form.questScope,
        requireOnJoinInput: form.requireOnJoinInput,
        remedyPolicy: {
          type: form.remedyType,
          maxRemedyDays: form.remedyType === 'limited' ? Number(form.maxRemedyDays) : null,
          allowBulk: form.remedyType === 'open' ? Boolean(form.allowBulk) : null,
        },
        startDay: form.questLayer === 'D' && form.startDay ? Number(form.startDay) : null,
        endDay: form.questLayer === 'D' && form.endDay ? Number(form.endDay) : null,
        revealAt: form.questLayer === 'D' && form.revealAt ? new Date(form.revealAt).toISOString() : null,
      };
      payload.challengeId = challengeId.trim();
      payload.startAt = form.startAt
        ? new Date(form.startAt).toISOString()
        : new Date().toISOString();
      if (form.endAt)    payload.endAt            = new Date(form.endAt).toISOString();
      if (form.verificationType === 'link') {
        payload.verificationConfig = {};
        if (form.linkExample.trim()) payload.verificationConfig.linkExample = form.linkExample.trim();
        if (form.linkPattern.trim()) payload.verificationConfig.linkPattern = form.linkPattern.trim();
      }
      if (form.verificationType === 'text') {
        payload.verificationConfig = { maxChars: Number(form.maxChars) };
      }

      await apiClient.post('/admin/quests', payload);
      alert('퀘스트가 생성되었습니다');
      navigate(-1);
    } catch (err: any) {
      setError(err.response?.data?.message || '생성에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-900 transition-colors">
          ← 뒤로
        </button>
        <h1 className="text-2xl font-bold text-gray-900">퀘스트 생성</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <h2 className="font-bold text-gray-800">연결 챌린지</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">챌린지 *</label>
            <select
              value={challengeId}
              onChange={e => setChallengeId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="">연결할 챌린지를 선택하세요</option>
              {challengeOptions.map(challenge => (
                <option key={challenge.challengeId} value={challenge.challengeId}>
                  {challenge.title} ({challenge.lifecycle ?? 'unknown'})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              챌린지별 퀘스트 운영을 위해 챌린지 선택이 필수입니다.
            </p>
            {challengeLoading && <p className="mt-1 text-xs text-gray-400">챌린지 목록을 불러오는 중...</p>}
          </div>
        </div>

        {/* 기본 정보 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-bold text-gray-800">기본 정보</h2>

          <div className="flex gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">아이콘</label>
              <input
                value={form.icon}
                onChange={e => set('icon', e.target.value)}
                className="w-16 h-12 text-2xl text-center border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">제목 *</label>
              <input
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="퀘스트 제목"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="퀘스트 설명"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">보상 포인트</label>
              <input
                type="number"
                min={0}
                value={form.rewardPoints}
                onChange={e => set('rewardPoints', Number(e.target.value) as any)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">표시 순서</label>
              <input
                type="number"
                min={0}
                value={form.displayOrder}
                onChange={e => set('displayOrder', Number(e.target.value) as any)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>

        {/* 인증 방식 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-bold text-gray-800">인증 방식</h2>

          <div className="grid grid-cols-4 gap-2">
            {VERIFICATION_TYPES.map(vt => {
              const isAllowed = allowedTypes.includes(vt.value);
              return (
                <button
                  key={vt.value}
                  type="button"
                  disabled={!isAllowed}
                  onClick={() => isAllowed && set('verificationType', vt.value as any)}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    form.verificationType === vt.value
                      ? 'bg-primary-600 text-white'
                      : isAllowed
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  {vt.label}
                </button>
              );
            })}
          </div>
          {challengeId && allowedTypes.length < 4 && (
            <p className="text-xs text-amber-600">이 챌린지는 일부 인증 방식만 허용합니다: {allowedTypes.join(', ')}</p>
          )}

          {form.verificationType === 'link' && (
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL 예시 (선택)</label>
                <input
                  value={form.linkExample}
                  onChange={e => set('linkExample', e.target.value)}
                  placeholder="https://github.com/..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL 정규식 패턴 (선택)</label>
                <input
                  value={form.linkPattern}
                  onChange={e => set('linkPattern', e.target.value)}
                  placeholder="https://github.com/.*"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                />
              </div>
            </div>
          )}

          {form.verificationType === 'text' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">최대 글자수</label>
              <input
                type="number"
                min={100}
                max={5000}
                value={form.maxChars}
                onChange={e => set('maxChars', Number(e.target.value) as any)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}


          <div className="mt-4 pt-4 border-t space-y-3">
            <p className="text-sm font-semibold text-gray-700">보완(Remedy) 정책</p>
            <div className="flex gap-4">
              {([
                { value: 'strict',  label: '엄격 (strict)' },
                { value: 'limited', label: '제한부 (limited)' },
                { value: 'open',    label: '자유 (open)' },
              ] as const).map((t) => (
                <label key={t.value} className="text-sm flex items-center gap-1">
                  <input type="radio" checked={form.remedyType === t.value} onChange={() => set('remedyType', t.value as any)} />
                  {t.label}
                </label>
              ))}
            </div>
            {form.remedyType === 'limited' && <select value={form.maxRemedyDays} onChange={(e)=>set('maxRemedyDays', Number(e.target.value) as any)} className="px-3 py-2 border rounded-lg"><option value={1}>1일</option><option value={2}>2일</option></select>}
            {form.remedyType === 'open' && <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={form.allowBulk} onChange={(e)=>set('allowBulk', e.target.checked as any)} /> 몰아서 제출 허용</label>}
          </div>
          {form.questLayer === 'D' && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
              <p className="text-xs text-amber-700 font-medium">D 레이어 — 날짜별 공개 설정 (선택)</p>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" min={1} max={7} placeholder="시작 Day" value={form.startDay} onChange={(e)=>set('startDay', e.target.value as any)} className="px-3 py-2 border rounded-lg text-sm"/>
                <input type="number" min={1} max={7} placeholder="종료 Day" value={form.endDay} onChange={(e)=>set('endDay', e.target.value as any)} className="px-3 py-2 border rounded-lg text-sm"/>
                <input type="datetime-local" value={form.revealAt} onChange={(e)=>set('revealAt', e.target.value as any)} className="px-3 py-2 border rounded-lg text-sm"/>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <input
              id="approvalRequired"
              type="checkbox"
              checked={form.approvalRequired}
              onChange={e => set('approvalRequired', e.target.checked as any)}
              className="w-4 h-4 text-primary-600 rounded"
            />
            <label htmlFor="approvalRequired" className="text-sm text-gray-700">
              관리자 승인 필요 (체크 해제 시 자동 승인)
            </label>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-bold text-gray-800">레이어/스코프 정책</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">퀘스트 레이어</label>
              <select
                value={form.questLayer}
                onChange={e => set('questLayer', e.target.value as QuestLayer)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="A">A 레이어 — 공통 (모든 참여자에게 동일 적용)</option>
                <option value="B">B 레이어 — 운영 확장 (특정 기간/그룹 대상)</option>
                <option value="D">D 레이어 — 개인화 (날짜별 공개 · 개인 목표 연동)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">퀘스트 스코프</label>
              <select
                value={form.questScope}
                onChange={e => set('questScope', e.target.value as QuestScope)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="leader">리더 중심</option>
                <option value="personal">개인 중심</option>
                <option value="mixed">혼합</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.requireOnJoinInput}
              onChange={e => set('requireOnJoinInput', e.target.checked)}
            />
            챌린지 참여 시 이 퀘스트용 추가 입력 필수
          </label>

          <p className="text-xs text-gray-500">
            참여자 입력 필수 옵션은 개인화 레이어에서 사용하세요. 리더 중심 퀘스트는 해제 권장.
          </p>
        </div>

        {/* 기간 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-bold text-gray-800">기간 (선택)</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시작 일시</label>
              <input
                type="datetime-local"
                value={form.startAt}
                onChange={e => set('startAt', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">종료 일시</label>
              <input
                type="datetime-local"
                value={form.endAt}
                onChange={e => set('endAt', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-primary-600 text-white font-bold rounded-2xl hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {loading ? '생성 중...' : '퀘스트 생성하기'}
        </button>
      </form>
    </div>
  );
};
