import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';

type Lifecycle = 'draft' | 'recruiting' | 'preparing' | 'active' | 'completed' | 'archived';
type ChallengeType = 'leader_only' | 'personal_only' | 'leader_personal' | 'mixed';

const CATEGORIES = [
  { value: 'health',        label: '💪 건강' },
  { value: 'habit',         label: '📅 습관' },
  { value: 'development',   label: '💻 개발' },
  { value: 'creativity',    label: '🎨 창작' },
  { value: 'relationship',  label: '🤝 관계' },
  { value: 'mindfulness',   label: '🧘 마음챙김' },
] as const;

type Category = typeof CATEGORIES[number]['value'];

const CHALLENGE_TYPES: Array<{ value: ChallengeType; label: string; hint: string }> = [
  { value: 'leader_only', label: '리더 퀘스트형', hint: '참여자는 리더가 설계한 퀘스트 중심으로 수행' },
  { value: 'personal_only', label: '개인 퀘스트형', hint: '참여자 개인 입력/개인 목표 중심으로 수행' },
  { value: 'leader_personal', label: '리더+개인 혼합형', hint: '공통 퀘스트와 개인 목표를 함께 수행' },
  { value: 'mixed', label: '혼합형(확장)', hint: '레이어 정책을 함께 사용하는 확장형' },
];

const INITIAL = {
  title:             '',
  description:       '',
  category:          'habit' as Category,
  targetTime:        '07:00',
  identityKeyword:   '',
  badgeIcon:         '🏆',
  badgeName:         '',
  recruitingStartAt: '',
  recruitingEndAt:   '',
  challengeStartAt:  '',
  durationDays:      7,
  maxParticipants:   '' as string,   // '' = 무제한
  challengeType:     'leader_personal' as ChallengeType,
  requirePersonalGoalOnJoin: true,
  requirePersonalTargetOnJoin: true,
  allowExtraVisibilityToggle: true,
  remedyType: 'open' as 'strict'|'limited'|'open',
  maxRemedyDays: 1,
  allowBulk: false,
  personalQuestEnabled: false,
  personalQuestAutoApprove: true,
};

export const AdminChallengeCreatePage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdChallengeId, setCreatedChallengeId] = useState('');
  const [lifecycleLoading, setLifecycleLoading] = useState<Lifecycle | null>(null);
  const [currentLifecycle, setCurrentLifecycle] = useState<Lifecycle | null>(null);

  const set = <K extends keyof typeof INITIAL>(key: K, val: (typeof INITIAL)[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));


  const handleTransition = async (target: Lifecycle, reason: string) => {
    if (!createdChallengeId) return;
    setLifecycleLoading(target);
    setError('');
    try {
      await apiClient.put(`/admin/challenges/${createdChallengeId}/lifecycle`, { lifecycle: target, reason });
      setCurrentLifecycle(target);
      alert(`챌린지가 ${target} 상태로 전환되었습니다`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || '챌린지 상태 전환에 실패했습니다. 현재 상태와 전환 경로를 확인해주세요.');
    } finally {
      setLifecycleLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('제목을 입력해주세요'); return; }
    if (form.description.trim().length < 10) { setError('설명은 10자 이상 입력해주세요'); return; }
    if (!form.identityKeyword.trim()) { setError('정체성 키워드를 입력해주세요'); return; }
    if (!form.badgeName.trim()) { setError('배지 이름을 입력해주세요'); return; }
    if (!form.recruitingStartAt) { setError('모집 시작일을 입력해주세요'); return; }
    if (!form.recruitingEndAt) { setError('모집 마감일을 입력해주세요'); return; }
    if (!form.challengeStartAt) { setError('챌린지 시작일을 입력해주세요'); return; }

    setLoading(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        title:            form.title.trim(),
        description:      form.description.trim(),
        category:         form.category,
        targetTime:       form.targetTime,
        identityKeyword:  form.identityKeyword.trim(),
        badgeIcon:        form.badgeIcon.trim() || '🏆',
        badgeName:        form.badgeName.trim(),
        recruitingStartAt: new Date(form.recruitingStartAt).toISOString(),
        recruitingEndAt:   new Date(form.recruitingEndAt).toISOString(),
        challengeStartAt:  new Date(form.challengeStartAt).toISOString(),
        durationDays:      Number(form.durationDays),
        challengeType:     form.challengeType,
        defaultRemedyPolicy: {
          type: form.remedyType,
          maxRemedyDays: form.remedyType === 'limited' ? Number(form.maxRemedyDays) : null,
          allowBulk: form.remedyType === 'open' ? Boolean(form.allowBulk) : null,
        },
        personalQuestEnabled: form.personalQuestEnabled,
        personalQuestAutoApprove: form.personalQuestAutoApprove,
        layerPolicy: {
          requirePersonalGoalOnJoin: form.requirePersonalGoalOnJoin,
          requirePersonalTargetOnJoin: form.requirePersonalTargetOnJoin,
          allowExtraVisibilityToggle: form.allowExtraVisibilityToggle,
        },
      };
      if (form.maxParticipants !== '') {
        payload.maxParticipants = Number(form.maxParticipants);
      }

      const res = await apiClient.post('/admin/challenges', payload);
      const challengeId = res.data?.data?.challengeId || '';
      const lifecycle = (res.data?.data?.lifecycle || null) as Lifecycle | null;
      setCreatedChallengeId(challengeId);
      setCurrentLifecycle(lifecycle);
      alert('챌린지가 생성되었습니다. 아래 운영 버튼으로 모집 시작/마감/챌린지 시작을 수동 전환할 수 있습니다.');
      navigate('/admin/challenges/create');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || '생성에 실패했습니다');
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
        <h1 className="text-2xl font-bold text-gray-900">챌린지 생성</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}

        {/* 기본 정보 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-bold text-gray-800">기본 정보</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제목 *</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="챌린지 제목 (최대 100자)"
              maxLength={100}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">설명 * (10자 이상)</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={4}
              placeholder="챌린지 설명 (10~1000자)"
              maxLength={1000}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{form.description.length}/1000</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">카테고리 *</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => set('category', cat.value)}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    form.category === cat.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">목표 시각 (HH:MM) *</label>
              <input
                type="time"
                value={form.targetTime}
                onChange={e => set('targetTime', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">정체성 키워드 *</label>
              <input
                value={form.identityKeyword}
                onChange={e => set('identityKeyword', e.target.value)}
                placeholder="예: 아침형 인간"
                maxLength={50}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          </div>
        </div>

        {/* 배지 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-bold text-gray-800">배지</h2>
          <div className="flex gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">배지 아이콘</label>
              <input
                value={form.badgeIcon}
                onChange={e => set('badgeIcon', e.target.value)}
                className="w-16 h-12 text-2xl text-center border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                maxLength={10}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">배지 이름 *</label>
              <input
                value={form.badgeName}
                onChange={e => set('badgeName', e.target.value)}
                placeholder="예: 7일 챌린지 완료자"
                maxLength={50}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          </div>
        </div>


        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-bold text-gray-800">레이어/참여 정책</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">챌린지 유형 *</label>
            <select
              value={form.challengeType}
              onChange={e => set('challengeType', e.target.value as ChallengeType)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {CHALLENGE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {CHALLENGE_TYPES.find((type) => type.value === form.challengeType)?.hint}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.requirePersonalGoalOnJoin} onChange={e => set('requirePersonalGoalOnJoin', e.target.checked)} />
              참여 시 개인 목표 입력 필수
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.requirePersonalTargetOnJoin} onChange={e => set('requirePersonalTargetOnJoin', e.target.checked)} />
              참여 시 개인 목표시간 필수
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.allowExtraVisibilityToggle} onChange={e => set('allowExtraVisibilityToggle', e.target.checked)} />
              추가 기록 공개 전환 허용
            </label>
          </div>
        </div>


        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-bold text-gray-800">Remedy Policy</h2>
          <div className="flex gap-4">
            {(['strict', 'limited', 'open'] as const).map((t) => (
              <label key={t} className="text-sm flex items-center gap-1">
                <input type="radio" checked={form.remedyType === t} onChange={() => set('remedyType', t as any)} />
                {t}
              </label>
            ))}
          </div>
          {form.remedyType === 'limited' && (
            <select value={form.maxRemedyDays} onChange={(e) => set('maxRemedyDays', Number(e.target.value) as any)} className="px-3 py-2 border rounded-lg">
              <option value={1}>1일</option>
              <option value={2}>2일</option>
            </select>
          )}
          {form.remedyType === 'open' && (
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={form.allowBulk} onChange={(e) => set('allowBulk', e.target.checked as any)} /> 몰아서 제출 허용
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={form.personalQuestEnabled} onChange={(e) => set('personalQuestEnabled', e.target.checked as any)} /> 개인 퀘스트 제안 사용
            </label>
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={form.personalQuestAutoApprove} onChange={(e) => set('personalQuestAutoApprove', e.target.checked as any)} /> 개인 퀘스트 자동 승인
            </label>
          </div>
        </div>

        {/* 일정 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-bold text-gray-800">일정</h2>
          <p className="text-xs text-gray-500">모집 시작 → 모집 마감 → 챌린지 시작 순서여야 합니다</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">모집 시작일 *</label>
              <input
                type="datetime-local"
                value={form.recruitingStartAt}
                onChange={e => set('recruitingStartAt', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">모집 마감일 *</label>
              <input
                type="datetime-local"
                value={form.recruitingEndAt}
                onChange={e => set('recruitingEndAt', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">챌린지 시작일 *</label>
              <input
                type="datetime-local"
                value={form.challengeStartAt}
                onChange={e => set('challengeStartAt', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">진행 기간 (일)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={form.durationDays}
                onChange={e => set('durationDays', Number(e.target.value) as unknown as typeof form.durationDays)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>

        {/* 참가자 제한 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-800 mb-3">최대 참가자 수</h2>
          <input
            type="number"
            min={1}
            value={form.maxParticipants}
            onChange={e => set('maxParticipants', e.target.value)}
            placeholder="비워두면 무제한"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="text-xs text-gray-400 mt-1">비워두면 참가자 수 제한 없음</p>
        </div>


        {createdChallengeId && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <p className="text-sm text-blue-800 mb-2">최근 생성 챌린지 ID: <span className="font-semibold">{createdChallengeId}</span></p>
            <p className="text-xs text-blue-700 mb-3">현재 상태: <span className="font-semibold">{currentLifecycle ?? 'unknown'}</span></p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleTransition('recruiting', 'admin_manual_recruiting_start')}
                disabled={lifecycleLoading !== null || currentLifecycle === 'recruiting'}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50"
              >
                {lifecycleLoading === 'recruiting' ? '전환 중...' : '리크루팅 시작'}
              </button>
              <button
                type="button"
                onClick={() => handleTransition('preparing', 'admin_manual_recruiting_close')}
                disabled={lifecycleLoading !== null || currentLifecycle === 'preparing'}
                className="px-4 py-2 rounded-xl bg-amber-600 text-white font-semibold disabled:opacity-50"
              >
                {lifecycleLoading === 'preparing' ? '전환 중...' : '리크루팅 종료(Preparing)'}
              </button>
              <button
                type="button"
                onClick={() => handleTransition('active', 'admin_manual_challenge_start')}
                disabled={lifecycleLoading !== null || currentLifecycle === 'active'}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50"
              >
                {lifecycleLoading === 'active' ? '전환 중...' : '챌린지 시작(Active)'}
              </button>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-primary-600 text-white font-bold rounded-2xl hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {loading ? '생성 중...' : '챌린지 생성하기'}
        </button>
      </form>
    </div>
  );
};
