import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { challengeApi, CreateChallengeParams, ChallengeCategory, ChallengeType } from '../api/challengeApi';
import { CHALLENGE_CATEGORIES } from '../constants/categories';
import { CoverImagePicker } from '../components/CoverImagePicker';

// ─── 폼 상태 타입 ────────────────────────────────────────────────────
interface FormState {
  // Step 1
  category: ChallengeCategory | '';
  title: string;
  description: string;

  // Step 2
  coverImageUrl: string | null;
  identityKeyword: string;
  badgeIcon: string;
  badgeName: string;
  // 완주 보상 — 배지는 기본, 실물/온라인 상품은 선택
  hasPhysicalReward: boolean;
  physicalRewardName: string;
  hasOnlineReward: boolean;
  onlineRewardName: string;
  targetTime: string;
  allowedVerificationTypes: Array<'image' | 'text' | 'link' | 'video'>;

  // Step 3
  recruitingStartAt: string;
  recruitingEndAt: string;
  challengeStartAt: string;
  durationDays: number;
  maxParticipants: string;
  challengeType: ChallengeType;
  joinApprovalRequired: boolean;
  personalQuestAutoApprove: boolean;
  leaderIdentityMode: 'realname' | 'handle' | 'custom';
  remedyChoice: 'free' | 'once' | 'last_day' | 'disabled';

  // Step 4
  participateAsCreator: boolean;
}

const INITIAL_FORM: FormState = {
  category: '',
  title: '',
  description: '',
  coverImageUrl: null,
  identityKeyword: '',
  badgeIcon: '🏆',
  badgeName: '',
  hasPhysicalReward: false,
  physicalRewardName: '',
  hasOnlineReward: false,
  onlineRewardName: '',
  targetTime: '07:00',
  allowedVerificationTypes: ['image', 'text'],
  recruitingStartAt: '',
  recruitingEndAt: '',
  challengeStartAt: '',
  durationDays: 7,
  maxParticipants: '',
  challengeType: 'leader_personal',
  joinApprovalRequired: false,
  personalQuestAutoApprove: true,
  leaderIdentityMode: 'realname',
  remedyChoice: 'free',
  participateAsCreator: true,
};

// 보완(놓친 날 복구) 정책 — 서버 defaultRemedyPolicy로 매핑
const REMEDY_CHOICE_OPTIONS: { value: FormState['remedyChoice']; label: string; desc: string }[] = [
  { value: 'free',     label: '자유 보완',        desc: '놓친 날을 언제든, 횟수 제한 없이 복구할 수 있어요' },
  { value: 'once',     label: '기간 중 1회만',     desc: '챌린지 전체에서 딱 한 번만 보완할 수 있어요' },
  { value: 'last_day', label: '마지막 날에 몰아서', desc: '마지막 날이 보완 전용일이 돼요 (실제 인증일은 기간-1일)' },
  { value: 'disabled', label: '보완 불가',        desc: '놓치면 복구할 수 없어요. 빡세게 가는 챌린지' },
];

function toRemedyPolicy(choice: FormState['remedyChoice']): { type: 'anytime' | 'last_day' | 'disabled'; maxRemedyDays: number | null } {
  if (choice === 'once') return { type: 'anytime', maxRemedyDays: 1 };
  if (choice === 'last_day') return { type: 'last_day', maxRemedyDays: null };
  if (choice === 'disabled') return { type: 'disabled', maxRemedyDays: null };
  return { type: 'anytime', maxRemedyDays: null };
}

// 참여자 식별 방식 — 리더/매니저 운영탭에서만 표시 (피드·마당 활동은 계속 익명)
const IDENTITY_MODE_OPTIONS: { value: FormState['leaderIdentityMode']; label: string; desc: string }[] = [
  { value: 'realname', label: '실명(가입명)', desc: '가입할 때 등록한 이름이 보여요' },
  { value: 'handle',   label: '@핸들',        desc: '참여자의 고유 핸들이 보여요 (없으면 가입명)' },
  { value: 'custom',   label: '직접 입력',     desc: '참여할 때 이 챌린지에서 쓸 이름을 입력받아요' },
];

const VERIFICATION_TYPES = [
  { key: 'image' as const, label: '사진', emoji: '📸' },
  { key: 'text' as const, label: '텍스트', emoji: '📝' },
  { key: 'link' as const, label: '링크', emoji: '🔗' },
  { key: 'video' as const, label: '영상', emoji: '🎬' },
];

const CHALLENGE_TYPE_OPTIONS: { value: ChallengeType; label: string; desc: string }[] = [
  { value: 'leader_personal', label: '리더+개인 퀘스트', desc: '공통 목표에 개인 퀘스트를 추가할 수 있어요' },
  { value: 'leader_only',     label: '공통 퀘스트만',   desc: '모든 참여자가 동일한 목표로 함께해요' },
  { value: 'personal_only',   label: '개인 퀘스트만',   desc: '각자 자신의 목표를 설정해요' },
  { value: 'mixed',           label: '혼합형',           desc: '공통 + 개인 퀘스트 모두 허용해요' },
];

// 날짜 입력용 로컬 datetime → ISO 변환
function localToISO(local: string): string {
  if (!local) return '';
  return new Date(local).toISOString();
}

// ISO → local datetime-local input 값
function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 오늘 기준 기본 날짜 세팅 (모집시작=오늘, 모집마감=3일후, 챌린지시작=5일후)
function getDefaultDates() {
  const now = new Date();
  const add = (d: Date, days: number) => { const r = new Date(d); r.setDate(r.getDate() + days); return r; };
  return {
    recruitingStartAt: toLocalInput(now.toISOString()),
    recruitingEndAt: toLocalInput(add(now, 3).toISOString()),
    challengeStartAt: toLocalInput(add(now, 5).toISOString()),
  };
}

// ─── 진행 표시 ────────────────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full flex-1 transition-all ${i < current ? 'bg-primary-500' : 'bg-gray-200'}`}
        />
      ))}
    </div>
  );
}

// ─── Step 1: 기본 정보 ────────────────────────────────────────────────
function Step1({ form, onChange }: { form: FormState; onChange: (patch: Partial<FormState>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">어떤 챌린지를 만들까요?</h2>
        <p className="text-sm text-gray-500">카테고리를 선택하고 챌린지 이름을 적어주세요</p>
      </div>

      {/* 카테고리 */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">카테고리</p>
        <div className="grid grid-cols-4 gap-2">
          {CHALLENGE_CATEGORIES.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => onChange({ category: cat.slug as ChallengeCategory })}
              className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all text-xs font-medium ${
                form.category === cat.slug
                  ? 'border-primary-400 bg-primary-50 text-primary-700'
                  : 'border-gray-100 bg-white text-gray-600'
              }`}
            >
              <span className="text-xl mb-0.5">{cat.emoji}</span>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* 제목 */}
      <div>
        <label className="text-sm font-semibold text-gray-700">챌린지 이름</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="ex. 매일 아침 30분 독서"
          maxLength={100}
          className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary-400"
        />
      </div>

      {/* 설명 */}
      <div>
        <label className="text-sm font-semibold text-gray-700">챌린지 소개</label>
        <textarea
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="이 챌린지가 왜 의미 있는지, 어떻게 진행되는지 소개해주세요"
          rows={4}
          maxLength={1000}
          className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-primary-400"
        />
        <p className="text-[11px] text-gray-400 mt-1 text-right">{form.description.length}/1000</p>
      </div>
    </div>
  );
}

// ─── Step 2: 정체성 설정 ─────────────────────────────────────────────
function Step2({ form, onChange }: { form: FormState; onChange: (patch: Partial<FormState>) => void }) {
  const toggleVerification = (key: 'image' | 'text' | 'link' | 'video') => {
    const current = form.allowedVerificationTypes;
    if (current.includes(key)) {
      if (current.length === 1) return; // 최소 1개
      onChange({ allowedVerificationTypes: current.filter((k) => k !== key) });
    } else {
      onChange({ allowedVerificationTypes: [...current, key] });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">정체성을 정의해요</h2>
        <p className="text-sm text-gray-500">참여자들이 이 챌린지를 통해 어떤 사람이 되는지 표현해주세요</p>
      </div>

      {/* 대표 이미지 (배너 카드용, 선택) */}
      <div>
        <label className="text-sm font-semibold text-gray-700">대표 이미지</label>
        <div className="mt-2">
          <CoverImagePicker
            value={form.coverImageUrl}
            onChange={(url) => onChange({ coverImageUrl: url })}
          />
        </div>
      </div>

      {/* 정체성 키워드 */}
      <div>
        <label className="text-sm font-semibold text-gray-700">정체성 키워드</label>
        <p className="text-[11px] text-gray-400 mt-0.5">참여자들은 "나는 ___이다"라는 선언으로 시작해요</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-sm text-gray-500 whitespace-nowrap">나는</span>
          <input
            type="text"
            value={form.identityKeyword}
            onChange={(e) => onChange({ identityKeyword: e.target.value })}
            placeholder="매일 읽는 사람"
            maxLength={50}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary-400"
          />
          <span className="text-sm text-gray-500 whitespace-nowrap">이다</span>
        </div>
      </div>

      {/* 배지 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-semibold text-gray-700">배지 아이콘</label>
          <input
            type="text"
            value={form.badgeIcon}
            onChange={(e) => onChange({ badgeIcon: e.target.value })}
            placeholder="🏆"
            maxLength={10}
            className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-center focus:outline-none focus:border-primary-400"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">배지 이름</label>
          <input
            type="text"
            value={form.badgeName}
            onChange={(e) => onChange({ badgeName: e.target.value })}
            placeholder="독서왕"
            maxLength={50}
            className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary-400"
          />
        </div>
      </div>

      {/* 완주 보상 — 배지는 기본 지급, 실물/온라인 상품은 선택 */}
      <div>
        <label className="text-sm font-semibold text-gray-700">완주 보상</label>
        <p className="text-[11px] text-gray-400 mt-0.5">배지는 기본 지급돼요. 상품을 지급한다면 추가로 선택하세요.</p>
        <div className="mt-2 space-y-2">
          {/* 실물 상품 */}
          <div className="rounded-xl border border-gray-200 p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.hasPhysicalReward}
                onChange={(e) => onChange({ hasPhysicalReward: e.target.checked })}
              />
              <span className="text-sm text-gray-800">📦 실물 상품 지급</span>
            </label>
            {form.hasPhysicalReward && (
              <input
                type="text"
                value={form.physicalRewardName}
                onChange={(e) => onChange({ physicalRewardName: e.target.value })}
                placeholder="예: 텀블러, 굿즈 세트"
                maxLength={60}
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-400"
              />
            )}
          </div>
          {/* 온라인 상품(기프티콘) */}
          <div className="rounded-xl border border-gray-200 p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.hasOnlineReward}
                onChange={(e) => onChange({ hasOnlineReward: e.target.checked })}
              />
              <span className="text-sm text-gray-800">🎁 온라인 상품(기프티콘 등) 지급</span>
            </label>
            {form.hasOnlineReward && (
              <input
                type="text"
                value={form.onlineRewardName}
                onChange={(e) => onChange({ onlineRewardName: e.target.value })}
                placeholder="예: 카페 기프티콘 5천원권"
                maxLength={60}
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-400"
              />
            )}
          </div>
        </div>
      </div>

      {/* 목표 시각 */}
      <div>
        <label className="text-sm font-semibold text-gray-700">매일 목표 시각</label>
        <p className="text-[11px] text-gray-400 mt-0.5">참여자들이 이 시각까지 인증해요</p>
        <input
          type="time"
          value={form.targetTime}
          onChange={(e) => onChange({ targetTime: e.target.value })}
          className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary-400"
        />
      </div>

      {/* 인증 방식 */}
      <div>
        <label className="text-sm font-semibold text-gray-700">인증 방식</label>
        <p className="text-[11px] text-gray-400 mt-0.5">복수 선택 가능</p>
        <div className="flex gap-2 mt-2">
          {VERIFICATION_TYPES.map((vt) => (
            <button
              key={vt.key}
              onClick={() => toggleVerification(vt.key)}
              className={`flex-1 flex flex-col items-center py-2.5 rounded-xl border-2 text-xs font-medium transition-all ${
                form.allowedVerificationTypes.includes(vt.key)
                  ? 'border-primary-400 bg-primary-50 text-primary-700'
                  : 'border-gray-100 bg-white text-gray-500'
              }`}
            >
              <span className="text-base">{vt.emoji}</span>
              {vt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: 일정·인원 ────────────────────────────────────────────────
function Step3({ form, onChange }: { form: FormState; onChange: (patch: Partial<FormState>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">일정과 인원을 설정해요</h2>
        <p className="text-sm text-gray-500">모집 기간과 챌린지 시작일을 정해주세요</p>
      </div>

      {/* 모집 기간 */}
      <div className="space-y-3">
        <div>
          <label className="text-sm font-semibold text-gray-700">모집 시작</label>
          <input
            type="datetime-local"
            value={form.recruitingStartAt}
            onChange={(e) => onChange({ recruitingStartAt: e.target.value })}
            className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary-400"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">모집 마감</label>
          <input
            type="datetime-local"
            value={form.recruitingEndAt}
            onChange={(e) => onChange({ recruitingEndAt: e.target.value })}
            className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary-400"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700">챌린지 시작</label>
          <input
            type="datetime-local"
            value={form.challengeStartAt}
            onChange={(e) => onChange({ challengeStartAt: e.target.value })}
            className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary-400"
          />
        </div>
      </div>

      {/* 기간 */}
      <div>
        <label className="text-sm font-semibold text-gray-700">챌린지 기간</label>
        <div className="flex gap-2 mt-2">
          {[3, 5, 7, 14, 21, 30].map((d) => (
            <button
              key={d}
              onClick={() => onChange({ durationDays: d })}
              className={`flex-1 py-2 rounded-xl border-2 text-xs font-medium transition-all ${
                form.durationDays === d
                  ? 'border-primary-400 bg-primary-50 text-primary-700'
                  : 'border-gray-100 bg-white text-gray-600'
              }`}
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      {/* 최대 인원 */}
      <div>
        <label className="text-sm font-semibold text-gray-700">최대 참여 인원</label>
        <p className="text-[11px] text-gray-400 mt-0.5">비워두면 무제한</p>
        <input
          type="number"
          value={form.maxParticipants}
          onChange={(e) => onChange({ maxParticipants: e.target.value })}
          placeholder="무제한"
          min={1}
          className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary-400"
        />
      </div>

      {/* 챌린지 타입 */}
      <div>
        <label className="text-sm font-semibold text-gray-700">퀘스트 방식</label>
        <div className="space-y-2 mt-2">
          {CHALLENGE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange({ challengeType: opt.value })}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                form.challengeType === opt.value
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-gray-100 bg-white'
              }`}
            >
              <p className={`text-sm font-medium ${form.challengeType === opt.value ? 'text-primary-700' : 'text-gray-800'}`}>
                {opt.label}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 참여 승인 */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
        <div>
          <p className="text-sm font-semibold text-gray-700">참여 수동 승인</p>
          <p className="text-[11px] text-gray-500 mt-0.5">켜면 신청자를 직접 심사해요</p>
        </div>
        <button
          onClick={() => onChange({ joinApprovalRequired: !form.joinApprovalRequired })}
          className={`w-11 h-6 rounded-full transition-colors relative ${form.joinApprovalRequired ? 'bg-primary-500' : 'bg-gray-300'}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform ${form.joinApprovalRequired ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* 보완 정책 — 놓친 날을 어떻게 복구할 수 있는지 (defaultRemedyPolicy) */}
      <div className="p-4 bg-gray-50 rounded-xl">
        <p className="text-sm font-semibold text-gray-700">보완 정책</p>
        <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
          인증을 놓친 날을 참여자가 복구(보완)할 수 있는 방식이에요. 보완 점수는 기본 점수의 70%예요.
        </p>
        <div className="space-y-2">
          {REMEDY_CHOICE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ remedyChoice: opt.value })}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                form.remedyChoice === opt.value ? 'border-primary-400 bg-primary-50' : 'border-gray-100 bg-white'
              }`}
            >
              <p className={`text-sm font-medium ${form.remedyChoice === opt.value ? 'text-primary-700' : 'text-gray-800'}`}>
                {opt.label}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
        {form.remedyChoice === 'last_day' && (
          <p className="mt-2 text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            {form.durationDays}일 챌린지라면 실제 인증일은 {Math.max(form.durationDays - 1, 1)}일이고, 마지막 하루는 보완 전용일이 돼요.
          </p>
        )}
      </div>

      {/* 참여자 식별 방식 — 운영탭(리더·매니저) 전용 표시, 피드·마당 익명은 유지 */}
      <div className="p-4 bg-gray-50 rounded-xl">
        <p className="text-sm font-semibold text-gray-700">참여자 식별 방식</p>
        <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
          운영탭에서 참여자를 어떤 이름으로 볼지 정해요. 리더·매니저에게만 보이고, 피드·마당 활동은 계속 익명이에요.
        </p>
        <div className="space-y-2">
          {IDENTITY_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ leaderIdentityMode: opt.value })}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                form.leaderIdentityMode === opt.value ? 'border-primary-400 bg-primary-50' : 'border-gray-100 bg-white'
              }`}
            >
              <p className={`text-sm font-medium ${form.leaderIdentityMode === opt.value ? 'text-primary-700' : 'text-gray-800'}`}>
                {opt.label}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 개인 퀘스트 승인 방식 (leader_only 제외) */}
      {form.challengeType !== 'leader_only' && (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
          <div className="pr-3">
            <p className="text-sm font-semibold text-gray-700">개인 퀘스트 자동 승인</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {form.personalQuestAutoApprove
                ? '참여자의 개인 퀘스트 제안을 즉시 확정해요'
                : '끄면 참여자 제안을 리더가 검토 후 승인해요'}
            </p>
          </div>
          <button
            onClick={() => onChange({ personalQuestAutoApprove: !form.personalQuestAutoApprove })}
            className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${form.personalQuestAutoApprove ? 'bg-primary-500' : 'bg-gray-300'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform ${form.personalQuestAutoApprove ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: 내 역할 ──────────────────────────────────────────────────
function Step4({ form, onChange }: { form: FormState; onChange: (patch: Partial<FormState>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">이 챌린지에서 내 역할은?</h2>
        <p className="text-sm text-gray-500">직접 참여할지, 운영만 할지 선택해주세요</p>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => onChange({ participateAsCreator: true })}
          className={`w-full text-left px-5 py-4 rounded-2xl border-2 transition-all ${
            form.participateAsCreator ? 'border-primary-400 bg-primary-50' : 'border-gray-100 bg-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
              form.participateAsCreator ? 'border-primary-500 bg-primary-500' : 'border-gray-300'
            }`}>
              {form.participateAsCreator && <div className="w-2 h-2 bg-white rounded-full" />}
            </div>
            <div>
              <p className={`text-sm font-semibold ${form.participateAsCreator ? 'text-primary-700' : 'text-gray-800'}`}>
                참여자 + 운영자
              </p>
              <p className="text-xs text-gray-500 mt-0.5">챌린지에 직접 참여하면서 운영해요</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => onChange({ participateAsCreator: false })}
          className={`w-full text-left px-5 py-4 rounded-2xl border-2 transition-all ${
            !form.participateAsCreator ? 'border-primary-400 bg-primary-50' : 'border-gray-100 bg-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
              !form.participateAsCreator ? 'border-primary-500 bg-primary-500' : 'border-gray-300'
            }`}>
              {!form.participateAsCreator && <div className="w-2 h-2 bg-white rounded-full" />}
            </div>
            <div>
              <p className={`text-sm font-semibold ${!form.participateAsCreator ? 'text-primary-700' : 'text-gray-800'}`}>
                운영자만
              </p>
              <p className="text-xs text-gray-500 mt-0.5">참여 없이 챌린지를 관리해요</p>
            </div>
          </div>
        </button>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
        <p className="font-medium mb-2">📋 챌린지 생성 후</p>
        <ul className="space-y-1 text-xs text-gray-500">
          <li>• 챌린지는 <strong>비공개(준비 중)</strong> 상태로 저장돼요</li>
          <li>• "모집 시작하기" 버튼으로 공개할 수 있어요</li>
          <li>• 참여자 심사, 가이드 관리를 할 수 있어요</li>
          <li>• 챌린지 완료 후 리더 뱃지를 받을 수 있어요 🎖️</li>
        </ul>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────
export function ChallengeCreatePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(() => ({
    ...INITIAL_FORM,
    ...getDefaultDates(),
  }));
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const onChange = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const createMutation = useMutation({
    mutationFn: () => {
      const params: CreateChallengeParams = {
        title: form.title,
        description: form.description,
        category: form.category as ChallengeCategory,
        targetTime: form.targetTime,
        identityKeyword: form.identityKeyword,
        badgeIcon: form.badgeIcon || '🏆',
        badgeName: form.badgeName,
        recruitingStartAt: localToISO(form.recruitingStartAt),
        recruitingEndAt: localToISO(form.recruitingEndAt),
        challengeStartAt: localToISO(form.challengeStartAt),
        durationDays: form.durationDays,
        maxParticipants: form.maxParticipants ? parseInt(form.maxParticipants, 10) : null,
        challengeType: form.challengeType,
        joinApprovalRequired: form.joinApprovalRequired,
        allowedVerificationTypes: form.allowedVerificationTypes,
        participateAsCreator: form.participateAsCreator,
        personalQuestAutoApprove: form.personalQuestAutoApprove,
        leaderIdentityMode: form.leaderIdentityMode,
        defaultRemedyPolicy: toRemedyPolicy(form.remedyChoice),
        rewardPhysical:
          form.hasPhysicalReward && form.physicalRewardName.trim()
            ? { name: form.physicalRewardName.trim() }
            : null,
        rewardOnline:
          form.hasOnlineReward && form.onlineRewardName.trim()
            ? { name: form.onlineRewardName.trim() }
            : null,
        coverImageUrl: form.coverImageUrl,
      };
      return challengeApi.createChallenge(params);
    },
    onSuccess: () => {
      setShowSuccessModal(true);
    },
  });

  // 단계별 유효성
  const canNext = () => {
    if (step === 1) return !!form.category && form.title.trim().length >= 1 && form.description.trim().length >= 10;
    if (step === 2) return form.identityKeyword.trim().length >= 1 && form.badgeName.trim().length >= 1 && form.allowedVerificationTypes.length >= 1;
    if (step === 3) return !!form.recruitingStartAt && !!form.recruitingEndAt && !!form.challengeStartAt;
    return true;
  };

  const TOTAL_STEPS = 4;

  return (
    <div className="min-h-screen">
      {/* 헤더 */}
      <div className="glass-header px-4 py-4 flex items-center gap-3">
        <button onClick={() => (step > 1 ? setStep((s) => s - 1) : navigate(-1))} className="text-gray-500 text-xl">
          ←
        </button>
        <h1 className="text-base font-bold text-gray-900">챌린지 만들기</h1>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        <StepIndicator current={step} total={TOTAL_STEPS} />

        {step === 1 && <Step1 form={form} onChange={onChange} />}
        {step === 2 && <Step2 form={form} onChange={onChange} />}
        {step === 3 && <Step3 form={form} onChange={onChange} />}
        {step === 4 && <Step4 form={form} onChange={onChange} />}

        <div className="mt-8">
          {step < TOTAL_STEPS ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
              className="w-full py-4 rounded-2xl bg-primary-500 text-white font-semibold text-base disabled:opacity-40 hover:bg-primary-600 transition-colors"
            >
              다음
            </button>
          ) : (
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="w-full py-4 rounded-2xl bg-primary-500 text-white font-semibold text-base disabled:opacity-40 hover:bg-primary-600 transition-colors"
            >
              {createMutation.isPending ? '생성 중...' : '챌린지 만들기'}
            </button>
          )}
          {createMutation.isError && (
            <p className="text-center text-xs text-red-500 mt-2">
              {(createMutation.error as any)?.response?.data?.message ?? '오류가 발생했어요. 다시 시도해주세요.'}
            </p>
          )}
        </div>
      </div>

      {/* 성공 모달 */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 space-y-4">
            <div className="text-center">
              <p className="text-3xl mb-2">🎉</p>
              <p className="text-lg font-bold text-gray-900">챌린지가 만들어졌어요!</p>
              <p className="text-sm text-gray-500 mt-1">준비중 목록에서 확인할 수 있어요</p>
            </div>
            <button
              onClick={() => navigate('/me?tab=pending', { replace: true })}
              className="w-full py-3.5 rounded-2xl bg-primary-500 text-white font-semibold text-sm hover:bg-primary-600 transition-colors"
            >
              챌린지 확인하기
            </button>
            <button
              onClick={() => navigate('/me?tab=active', { replace: true })}
              className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-colors"
            >
              나중에 하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
