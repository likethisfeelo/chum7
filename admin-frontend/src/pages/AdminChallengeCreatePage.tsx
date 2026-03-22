import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { lifecycleLabel } from '@/utils/lifecycle';

type Lifecycle = 'draft' | 'recruiting' | 'preparing' | 'active' | 'completed' | 'archived';
type ChallengeType = 'leader_only' | 'personal_only' | 'leader_personal';
type VerificationType = 'image' | 'text' | 'link' | 'video';
type RemedyType = 'anytime' | 'last_day' | 'disabled';
type Category = 'health' | 'habit' | 'development' | 'creativity' | 'relationship' | 'mindfulness' | 'expand' | 'impact';

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: 'health',       label: '💗 Selflove' },
  { value: 'mindfulness',  label: '🔥 Attitude' },
  { value: 'habit',        label: '⚡ Discipline' },
  { value: 'creativity',   label: '🧭 Explore' },
  { value: 'development',  label: '🎨 Create' },
  { value: 'relationship', label: '🏗️ Build' },
  { value: 'expand',       label: '🌱 Expand' },
  { value: 'impact',       label: '🚀 Impact' },
];

const CHALLENGE_TYPES: Array<{ value: ChallengeType; icon: string; label: string; desc: string }> = [
  {
    value: 'leader_only',
    icon: '🎯',
    label: '리더 퀘스트형',
    desc: '리더 퀘스트 1개 인증으로 하루 완료\n개인퀘스트 없음',
  },
  {
    value: 'personal_only',
    icon: '🌱',
    label: '개인 퀘스트형',
    desc: '개인 퀘스트 1개 인증으로 하루 완료\n리더퀘스트 없음',
  },
  {
    value: 'leader_personal',
    icon: '🤝',
    label: '리더+개인 혼합형',
    desc: '리더퀘스트 + 개인퀘스트\n둘 다 인증해야 하루 완료',
  },
];

const VERIFICATION_TYPES: Array<{ value: VerificationType; icon: string; label: string }> = [
  { value: 'image', icon: '📸', label: '사진' },
  { value: 'text',  icon: '✍️', label: '텍스트' },
  { value: 'link',  icon: '🔗', label: 'URL' },
  { value: 'video', icon: '🎥', label: '영상' },
];

const DURATION_PRESETS = [7, 14, 21, 30];

const LIFECYCLE_TRANSITIONS: Array<{ target: Lifecycle; label: string; color: string }> = [
  { target: 'recruiting', label: '모집 시작',   color: 'bg-indigo-600 hover:bg-indigo-700' },
  { target: 'preparing',  label: '모집 마감',   color: 'bg-amber-600 hover:bg-amber-700' },
  { target: 'active',     label: '챌린지 시작', color: 'bg-blue-600 hover:bg-blue-700' },
  { target: 'completed',  label: '완료 처리',   color: 'bg-gray-500 hover:bg-gray-600' },
];

interface FormState {
  title: string;
  description: string;
  category: Category;
  targetTime: string;
  identityKeyword: string;
  badgeIcon: string;
  badgeName: string;
  recruitingStartAt: string;
  recruitingEndAt: string;
  challengeStartAt: string;
  durationDays: number;
  maxParticipants: string;
  challengeType: ChallengeType;
  requirePersonalTargetOnJoin: boolean;
  allowExtraVisibilityToggle: boolean;
  remedyType: RemedyType;
  maxRemedyDays: number;
  personalQuestAutoApprove: boolean;
  joinApprovalRequired: boolean;
  allowedVerificationTypes: VerificationType[];
}

const INITIAL: FormState = {
  title: '',
  description: '',
  category: 'habit',
  targetTime: '07:00',
  identityKeyword: '',
  badgeIcon: '🏆',
  badgeName: '',
  recruitingStartAt: '',
  recruitingEndAt: '',
  challengeStartAt: '',
  durationDays: 7,
  maxParticipants: '',
  challengeType: 'leader_personal',
  requirePersonalTargetOnJoin: true,
  allowExtraVisibilityToggle: true,
  remedyType: 'anytime',
  maxRemedyDays: 1,
  personalQuestAutoApprove: true,
  joinApprovalRequired: false,
  allowedVerificationTypes: ['image', 'text', 'link', 'video'],
};

const S = 'bg-white rounded-2xl border border-gray-200 p-5 space-y-4';
const I = 'w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent';
const IE = 'w-full px-3 py-2.5 border border-red-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent';

export const AdminChallengeCreatePage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdId, setCreatedId] = useState('');
  const [currentLifecycle, setCurrentLifecycle] = useState<Lifecycle>('draft');
  const [lifecycleLoading, setLifecycleLoading] = useState<Lifecycle | null>(null);
  const [lifecycleError, setLifecycleError] = useState('');

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  // 실시간 타임라인 검증
  const timelineErrors = useMemo(() => {
    const e: Record<string, string> = {};
    if (form.recruitingStartAt && form.recruitingEndAt) {
      if (new Date(form.recruitingEndAt) <= new Date(form.recruitingStartAt)) {
        e.recruitingEndAt = '모집 마감일은 모집 시작일 이후여야 합니다';
      }
    }
    if (form.recruitingEndAt && form.challengeStartAt) {
      if (new Date(form.challengeStartAt).getTime() < new Date(form.recruitingEndAt).getTime() + 60_000) {
        e.challengeStartAt = '챌린지 시작일은 모집 마감 후 최소 1분 이후여야 합니다';
      }
    }
    return e;
  }, [form.recruitingStartAt, form.recruitingEndAt, form.challengeStartAt]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.title.trim())                       return setError('제목을 입력해주세요');
    if (form.description.trim().length < 10)      return setError('설명은 10자 이상 입력해주세요');
    if (!form.identityKeyword.trim())              return setError('정체성 키워드를 입력해주세요');
    if (!form.badgeName.trim())                    return setError('배지 이름을 입력해주세요');
    if (!form.recruitingStartAt || !form.recruitingEndAt || !form.challengeStartAt)
                                                   return setError('일정을 모두 입력해주세요');
    if (Object.keys(timelineErrors).length > 0)   return setError('일정 오류를 먼저 수정해주세요');
    if (form.allowedVerificationTypes.length === 0) return setError('인증 유형을 최소 1개 선택해주세요');

    setSubmitting(true);
    try {
      // requirePersonalGoalOnJoin은 challengeType에서 자동 결정
      const requirePersonalGoalOnJoin = form.challengeType !== 'leader_only';

      const payload: Record<string, unknown> = {
        title:           form.title.trim(),
        description:     form.description.trim(),
        category:        form.category,
        targetTime:      form.targetTime,
        identityKeyword: form.identityKeyword.trim(),
        badgeIcon:       form.badgeIcon.trim() || '🏆',
        badgeName:       form.badgeName.trim(),
        recruitingStartAt: new Date(form.recruitingStartAt).toISOString(),
        recruitingEndAt:   new Date(form.recruitingEndAt).toISOString(),
        challengeStartAt:  new Date(form.challengeStartAt).toISOString(),
        durationDays:    form.durationDays,
        challengeType:   form.challengeType,
        defaultRemedyPolicy: {
          type:          form.remedyType,
          maxRemedyDays: form.remedyType === 'last_day' && form.maxRemedyDays > 0 ? form.maxRemedyDays : null,
        },
        layerPolicy: {
          requirePersonalGoalOnJoin,
          requirePersonalTargetOnJoin: form.requirePersonalTargetOnJoin,
          allowExtraVisibilityToggle:  form.allowExtraVisibilityToggle,
        },
        personalQuestAutoApprove: form.personalQuestAutoApprove,
        joinApprovalRequired:     form.joinApprovalRequired,
        allowedVerificationTypes: form.allowedVerificationTypes,
      };
      if (form.maxParticipants !== '') {
        payload.maxParticipants = Number(form.maxParticipants);
      }

      const res = await apiClient.post('/admin/challenges', payload);
      const data = res.data?.data;
      setCreatedId(data.challengeId || '');
      setCurrentLifecycle((data.lifecycle as Lifecycle) || 'draft');
      setForm(INITIAL);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || '생성에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransition = async (target: Lifecycle) => {
    if (!createdId) return;
    setLifecycleLoading(target);
    setLifecycleError('');
    try {
      await apiClient.put(`/admin/challenges/${createdId}/lifecycle`, {
        lifecycle: target,
        reason: `admin_manual_${target}`,
      });
      setCurrentLifecycle(target);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setLifecycleError(e.response?.data?.message || '상태 전환에 실패했습니다');
    } finally {
      setLifecycleLoading(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 pb-24">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
        >
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">챌린지 생성</h1>
          <p className="text-xs text-gray-500 mt-0.5">새 챌린지를 만들고 일정을 설정합니다</p>
        </div>
      </div>

      {/* 생성 완료 패널 */}
      {createdId && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">✅</span>
            <h3 className="font-bold text-green-900">챌린지 생성 완료!</h3>
          </div>
          <div className="text-sm text-green-800 space-y-1">
            <p>ID: <code className="bg-green-100 px-1.5 py-0.5 rounded text-xs font-mono">{createdId}</code></p>
            <p>현재 상태: <span className="font-semibold">{lifecycleLabel(currentLifecycle)}</span></p>
          </div>
          {lifecycleError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{lifecycleError}</p>
          )}
          <div className="border-t border-green-200 pt-3">
            <p className="text-xs text-green-700 mb-2 font-medium">수동 상태 전환</p>
            <div className="flex flex-wrap gap-2">
              {LIFECYCLE_TRANSITIONS.map(({ target, label, color }) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => handleTransition(target)}
                  disabled={lifecycleLoading !== null || currentLifecycle === target}
                  className={`px-3 py-1.5 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50 ${color}`}
                >
                  {lifecycleLoading === target ? '전환 중...' : label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCreatedId('')}
            className="text-xs text-green-700 underline"
          >
            닫고 새 챌린지 만들기
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}

        {/* ① 기본 정보 */}
        <div className={S}>
          <h2 className="font-bold text-gray-800">① 기본 정보</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              제목 <span className="text-red-500">*</span>
            </label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="챌린지 제목 (최대 100자)"
              maxLength={100}
              className={I}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              설명 <span className="text-red-500">*</span>{' '}
              <span className="text-xs font-normal text-gray-400">(10자 이상)</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={4}
              placeholder="챌린지 설명 (10~1000자)"
              maxLength={1000}
              className={`${I} resize-none`}
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{form.description.length}/1000</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              카테고리 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => set('category', cat.value)}
                  className={`py-2 px-1 rounded-xl text-xs font-medium transition-colors ${
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                목표 시각 <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={form.targetTime}
                onChange={e => set('targetTime', e.target.value)}
                className={I}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                정체성 키워드 <span className="text-red-500">*</span>
              </label>
              <input
                value={form.identityKeyword}
                onChange={e => set('identityKeyword', e.target.value)}
                placeholder="예: 아침형 인간"
                maxLength={50}
                className={I}
              />
            </div>
          </div>
        </div>

        {/* ② 챌린지 유형 */}
        <div className={S}>
          <div>
            <h2 className="font-bold text-gray-800">② 챌린지 유형 <span className="text-red-500">*</span></h2>
            <p className="text-xs text-gray-500 mt-0.5">인증 완료 조건과 하루 완료 기준을 결정합니다</p>
          </div>
          <div className="space-y-2">
            {CHALLENGE_TYPES.map(type => (
              <button
                key={type.value}
                type="button"
                onClick={() => set('challengeType', type.value)}
                className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all ${
                  form.challengeType === type.value
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl leading-none">{type.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-sm ${
                        form.challengeType === type.value ? 'text-primary-700' : 'text-gray-900'
                      }`}>
                        {type.label}
                      </span>
                      {form.challengeType === type.value && (
                        <span className="text-xs px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded-full font-medium">
                          선택됨
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{type.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {form.challengeType === 'leader_personal' && (
            <div className="flex gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="text-amber-500 text-sm flex-shrink-0">ℹ️</span>
              <p className="text-xs text-amber-700">
                혼합형은 리더퀘스트·개인퀘스트 인증을 각각 1개씩 제출해야 하루 완료로 처리됩니다.
                첫 번째 인증 제출 후 "부분 완료" 상태가 됩니다.
              </p>
            </div>
          )}
        </div>

        {/* ③ 완주 배지 */}
        <div className={S}>
          <h2 className="font-bold text-gray-800">③ 완주 배지</h2>
          <div className="flex gap-3 items-start">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">아이콘</label>
              <input
                value={form.badgeIcon}
                onChange={e => set('badgeIcon', e.target.value)}
                className="w-16 h-10 text-2xl text-center border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                maxLength={10}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                배지 이름 <span className="text-red-500">*</span>
              </label>
              <input
                value={form.badgeName}
                onChange={e => set('badgeName', e.target.value)}
                placeholder="예: 7일 챌린지 완료자"
                maxLength={50}
                className={I}
              />
            </div>
          </div>
        </div>

        {/* ④ 일정 */}
        <div className={S}>
          <div>
            <h2 className="font-bold text-gray-800">④ 일정</h2>
            <p className="text-xs text-gray-500 mt-0.5">모집 시작 → 모집 마감 → 챌린지 시작 순서여야 합니다</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              모집 시작 <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={form.recruitingStartAt}
              onChange={e => set('recruitingStartAt', e.target.value)}
              className={I}
            />
          </div>

          <div className="flex justify-center -my-1">
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-200">
              ↓ 모집 기간
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              모집 마감 <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={form.recruitingEndAt}
              onChange={e => set('recruitingEndAt', e.target.value)}
              className={timelineErrors.recruitingEndAt ? IE : I}
            />
            {timelineErrors.recruitingEndAt && (
              <p className="text-xs text-red-500 mt-1">{timelineErrors.recruitingEndAt}</p>
            )}
          </div>

          <div className="flex justify-center -my-1">
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-200">
              ↓ 준비 기간 (최소 1분)
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              챌린지 시작 <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={form.challengeStartAt}
              onChange={e => set('challengeStartAt', e.target.value)}
              className={timelineErrors.challengeStartAt ? IE : I}
            />
            {timelineErrors.challengeStartAt && (
              <p className="text-xs text-red-500 mt-1">{timelineErrors.challengeStartAt}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">진행 기간</label>
            <div className="flex items-center gap-2 flex-wrap">
              {DURATION_PRESETS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set('durationDays', d)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    form.durationDays === d
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {d}일
                </button>
              ))}
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={form.durationDays}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) set('durationDays', Math.max(1, Math.min(30, v)));
                  }}
                  className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-500">일</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              종료일 = 챌린지 시작 + {form.durationDays}일 (자동 계산)
            </p>
          </div>
        </div>

        {/* ⑤ 허용 인증 방식 */}
        <div className={S}>
          <div>
            <h2 className="font-bold text-gray-800">⑤ 허용 인증 방식</h2>
            <p className="text-xs text-gray-500 mt-0.5">최소 1개 이상 선택</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {VERIFICATION_TYPES.map(vt => {
              const checked = form.allowedVerificationTypes.includes(vt.value);
              return (
                <button
                  key={vt.value}
                  type="button"
                  onClick={() => {
                    const next = checked
                      ? form.allowedVerificationTypes.filter(t => t !== vt.value)
                      : [...form.allowedVerificationTypes, vt.value];
                    if (next.length > 0) set('allowedVerificationTypes', next);
                  }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-sm font-medium ${
                    checked
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span>{vt.icon}</span>
                  <span>{vt.label}</span>
                  {checked && <span className="ml-auto text-primary-500 text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ⑥ 보완 인증 정책 */}
        <div className={S}>
          <div>
            <h2 className="font-bold text-gray-800">⑥ 보완 인증 정책</h2>
            <p className="text-xs text-gray-500 mt-0.5">챌린지 기간 내 이전 실패일을 보완 인증할 수 있는 정책</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'anytime'  as RemedyType, icon: '🔓', label: '자유',       desc: '언제든 빈날 채우기' },
              { value: 'last_day' as RemedyType, icon: '🔢', label: '마지막날',   desc: '최대 N회' },
              { value: 'disabled' as RemedyType, icon: '🔒', label: '보완 불가',  desc: '보완 없음' },
            ]).map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => set('remedyType', t.value)}
                className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all ${
                  form.remedyType === t.value
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-xl">{t.icon}</span>
                <span className={`text-xs font-semibold ${
                  form.remedyType === t.value ? 'text-primary-700' : 'text-gray-700'
                }`}>{t.label}</span>
                <span className="text-xs text-gray-400">{t.desc}</span>
              </button>
            ))}
          </div>

          {form.remedyType === 'last_day' && (
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-700 font-medium">최대 보완 횟수</label>
              <select
                value={form.maxRemedyDays}
                onChange={e => set('maxRemedyDays', Number(e.target.value))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {Array.from({ length: Math.max(form.durationDays - 1, 1) }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n}회</option>
                ))}
                <option value={0}>제한 없음 (전체 실패일)</option>
              </select>
              <p className="text-xs text-gray-400">최대 {form.durationDays - 1}회 (기간-1)</p>
            </div>
          )}
        </div>

        {/* ⑦ 참여 및 운영 설정 */}
        <div className={S}>
          <h2 className="font-bold text-gray-800">⑦ 참여 및 운영 설정</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">최대 참가자 수</label>
            <input
              type="number"
              min={1}
              value={form.maxParticipants}
              onChange={e => set('maxParticipants', e.target.value)}
              placeholder="비워두면 무제한"
              className={I}
            />
            <p className="text-xs text-gray-400 mt-1">비워두면 참가자 수 제한 없음</p>
          </div>

          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.requirePersonalTargetOnJoin}
                onChange={e => set('requirePersonalTargetOnJoin', e.target.checked)}
                className="mt-0.5 w-4 h-4 text-primary-600 rounded"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">참여 시 목표 시각 입력 필수</span>
                <p className="text-xs text-gray-400 mt-0.5">참여 신청 시 하루 목표 시각을 직접 입력하도록 합니다</p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allowExtraVisibilityToggle}
                onChange={e => set('allowExtraVisibilityToggle', e.target.checked)}
                className="mt-0.5 w-4 h-4 text-primary-600 rounded"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">추가 기록 공개 전환 허용</span>
                <p className="text-xs text-gray-400 mt-0.5">나만 보기로 저장된 추가 기록을 공개 피드로 전환할 수 있도록 합니다</p>
              </div>
            </label>

            {form.challengeType !== 'leader_only' && (
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.personalQuestAutoApprove}
                  onChange={e => set('personalQuestAutoApprove', e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-primary-600 rounded"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">개인 퀘스트 자동 승인</span>
                  <p className="text-xs text-gray-400 mt-0.5">참여자가 제안한 개인 퀘스트를 리더 확인 없이 자동으로 확정합니다</p>
                </div>
              </label>
            )}

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.joinApprovalRequired}
                onChange={e => set('joinApprovalRequired', e.target.checked)}
                className="mt-0.5 w-4 h-4 text-primary-600 rounded"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">
                  참여 승인 필요{' '}
                  <span className="text-xs text-gray-400 font-normal">(유료 챌린지용)</span>
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  체크 해제 시 신청 즉시 자동 확정됩니다. 무료 챌린지는 해제 권장.
                </p>
              </div>
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 bg-primary-600 text-white font-bold rounded-2xl hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm"
        >
          {submitting ? '생성 중...' : '챌린지 생성하기'}
        </button>
      </form>
    </div>
  );
};
