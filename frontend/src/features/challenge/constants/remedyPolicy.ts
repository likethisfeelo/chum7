/**
 * 보완 정책 선택지 — 생성/수정 페이지 공용.
 * 서버 defaultRemedyPolicy({type, maxRemedyDays})와 UI 선택지(remedyChoice) 간 매핑.
 */
export type RemedyChoice = 'free' | 'once' | 'last_day' | 'disabled';

export const REMEDY_CHOICE_OPTIONS: { value: RemedyChoice; label: string; desc: string }[] = [
  { value: 'free',     label: '자유 보완',        desc: '놓친 날을 언제든, 횟수 제한 없이 복구할 수 있어요' },
  { value: 'once',     label: '기간 중 1회만',     desc: '챌린지 전체에서 딱 한 번만 보완할 수 있어요' },
  { value: 'last_day', label: '마지막 날에 몰아서', desc: '마지막 날이 보완 전용일이 돼요 (실제 인증일은 기간-1일)' },
  { value: 'disabled', label: '보완 불가',        desc: '놓치면 복구할 수 없어요. 빡세게 가는 챌린지' },
];

export function toRemedyPolicy(choice: RemedyChoice): {
  type: 'anytime' | 'last_day' | 'disabled';
  maxRemedyDays: number | null;
} {
  if (choice === 'once') return { type: 'anytime', maxRemedyDays: 1 };
  if (choice === 'last_day') return { type: 'last_day', maxRemedyDays: null };
  if (choice === 'disabled') return { type: 'disabled', maxRemedyDays: null };
  return { type: 'anytime', maxRemedyDays: null };
}

/** 저장된 defaultRemedyPolicy → UI 선택지 (수정 페이지 초기값용) */
export function fromRemedyPolicy(policy: any): RemedyChoice {
  const type = String(policy?.type || 'anytime');
  if (type === 'disabled') return 'disabled';
  if (type === 'last_day') return 'last_day';
  return policy?.maxRemedyDays === 1 ? 'once' : 'free';
}

// 참여자 식별 방식 — 생성/수정 공용 (리더·매니저 운영탭 전용 표시, 피드·마당 익명 유지)
export type LeaderIdentityMode = 'realname' | 'handle' | 'custom';

export const IDENTITY_MODE_OPTIONS: { value: LeaderIdentityMode; label: string; desc: string }[] = [
  { value: 'realname', label: '실명(가입명)', desc: '가입할 때 등록한 이름이 보여요' },
  { value: 'handle',   label: '@핸들',        desc: '참여자의 고유 핸들이 보여요 (없으면 가입명)' },
  {
    value: 'custom',
    label: '직접 입력',
    desc: '참여할 때 이 챌린지에서 쓸 이름을 정해요. 매일 바뀌는 활동명 대신 서로를 알아볼 고정 이름이에요',
  },
];

/** 식별 방식 섹션 공통 안내 — 익명 활동명이 매일 바뀌어 식별용 고정 이름이 필요한 맥락 */
export const IDENTITY_SECTION_GUIDE =
  '피드의 활동명은 매일 바뀌는 익명이라, 리더·매니저가 참여자를 알아보고 소통하려면 고정된 이름이 필요해요. 운영탭에서만 보이고 피드·마당 활동은 계속 익명이에요.';
