/**
 * 보완(remedy) 상태 공용 유틸 — "오늘이 Day 몇인지"와 "놓친 Day 목록"의 단일 소스.
 * 서버 저장 currentDay는 phase 전이 지연 등으로 갱신이 밀릴 수 있어(0/1 고착),
 * 클라이언트에서 시작일 기준 KST 달력으로 직접 계산한다
 * (ChallengeFeedPage 진행현황 그리드와 동일 로직 — 이관).
 */
import { getRemainingRemedyCount, getRemedyType } from './flowPolicy';

/**
 * 보완 인증 판별 — 보완은 '지난 Day'를 채우는 제출이라 오늘 인증으로 세면 안 된다.
 * 서버 레코드는 type='remedy' + originalDay(대상 Day)를 갖지만, performedAt/practiceAt은
 * '오늘 실천한 시각'이라 날짜만 보면 오늘 인증과 구분되지 않는다.
 */
export function isRemedyVerification(verification: any): boolean {
  if (!verification) return false;
  if (String(verification.type || '').toLowerCase() === 'remedy') return true;
  return verification.originalDay !== null && verification.originalDay !== undefined;
}

export function getKstDateOnly(): Date {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}

/** 오늘이 이 참여의 Day 몇인지 — 시작일 기준 KST 달력 계산 (시작 전이어도 최소 1) */
export function computeTodayChallengeDay(userChallenge: any): number {
  const start =
    userChallenge?.challenge?.actualStartAt ||
    userChallenge?.challenge?.startConfirmedAt ||
    userChallenge?.startDate ||
    userChallenge?.challenge?.startDate ||
    userChallenge?.challenge?.startAt ||
    userChallenge?.challenge?.challengeStartAt;
  if (!start) return Math.max(1, Number(userChallenge?.currentDay || 1));

  const dateOnlyMatch = typeof start === 'string' && start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let startDate: Date;
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    startDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  } else {
    const parsed = new Date(start);
    if (Number.isNaN(parsed.getTime())) return Math.max(1, Number(userChallenge?.currentDay || 1));
    const kstMs = parsed.getTime() + 9 * 60 * 60 * 1000;
    const kst = new Date(kstMs);
    startDate = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  }
  const today = getKstDateOnly();
  const elapsed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, elapsed + 1);
}

/**
 * 참여 아이템에서 보완 정책 해석 — 참여 레코드(remedyPolicy)는 join 시 저장되지 않아
 * 대부분 null이므로, 챌린지 META(challenge.remedyPolicy = defaultRemedyPolicy)로 폴백한다.
 * (참여 레벨 값만 읽으면 last_day/disabled 챌린지가 전부 anytime으로 오판된다)
 */
export function remedyPolicyOf(item: any): any {
  return item?.remedyPolicy ?? item?.challenge?.remedyPolicy ?? null;
}

export function durationDaysOf(item: any): number {
  return (
    Number(item?.durationDays || item?.challenge?.durationDays || 0) ||
    (Array.isArray(item?.progress) ? item.progress.length : 7)
  );
}

/**
 * 지나간 날짜 중 미완료·미보완 Day 목록.
 * 오늘은 제외 — 아직 일반 인증으로 채울 수 있는 날이라 보완 대상이 아니다.
 * 기간이 끝나면 점수·완주 판정이 확정되므로 그 뒤로는 대상이 없다(서버 규칙과 동일).
 *
 * progress 항목이 아니라 Day 번호(1..오늘-1)를 순회한다 — 서버는 제출이 있었던 날만
 * progress 항목을 만들기 때문에, 아무것도 올리지 않은 날은 '항목 없음'으로 나타난다.
 * (항목만 훑으면 한 번도 손대지 않은 날이 통째로 누락돼 보완 대상이 0건이 된다)
 */
export function missedDaysOf(item: any): number[] {
  const todayDay = computeTodayChallengeDay(item);
  const durationDays = durationDaysOf(item);
  if (todayDay > durationDays) return []; // 종료 — 보완 창이 닫혀 대상 없음
  const bound = Math.min(todayDay, durationDays);

  const byDay = new Map<number, any>();
  for (const p of Array.isArray(item?.progress) ? item.progress : []) {
    byDay.set(Number(p?.day), p);
  }

  const missed: number[] = [];
  for (let day = 1; day < bound; day += 1) {
    const p = byDay.get(day);
    if (p && (p.status === 'success' || p.remedied)) continue; // 완료 또는 보완 완료
    missed.push(day);
  }
  return missed;
}

export interface MissedChallenge {
  userChallengeId: string;
  challengeId: string;
  title: string;
  badgeIcon: string;
  missedDays: number[];
  todayDay: number;
  durationDays: number;
}

/**
 * "지금 보완 가능한" 챌린지 목록 (정책·잔여 횟수 반영, 놓친 날 많은 순).
 * 서버 보완 창과 동일한 기준으로 거른다 — 진행 중(기간 내)이고, 중도 포기·해산·
 * 보완 불가 정책이 아닌 참여만. 종료된 챌린지는 즉시 제외된다.
 * (상태가 아닌 기간으로 판정 — 저장 status는 갱신이 밀릴 수 있다.)
 */
export function collectMissedChallenges(items: any[]): MissedChallenge[] {
  const result: MissedChallenge[] = [];
  for (const item of items || []) {
    if (String(item?.status) === 'gave_up' || String(item?.phase) === 'gave_up') continue;
    if (item?.challenge?.disbanded === true) continue;
    const policy = remedyPolicyOf(item);
    const remedyType = getRemedyType(policy);
    if (remedyType === 'disabled') continue;
    const todayDay = computeTodayChallengeDay(item);
    const durationDays = durationDaysOf(item);
    if (todayDay > durationDays) continue; // 종료 — 보완 창이 닫혔다
    // 마지막날 전용 정책은 서버가 그 날 하루만 창을 연다
    if (remedyType === 'last_day' && todayDay !== durationDays) continue;
    // anytime은 Day 2부터 창이 열린다 (서버 REMEDY_WRONG_DAY와 일치 — Day 1엔 놓친 날도 없다)
    const remaining = getRemainingRemedyCount(policy, item?.progress || []);
    if (remaining !== null && remaining <= 0) continue;
    const missedDays = missedDaysOf(item);
    if (missedDays.length === 0) continue;
    result.push({
      userChallengeId: String(item.userChallengeId),
      challengeId: String(item.challengeId),
      title: String(item?.challenge?.title || '챌린지'),
      badgeIcon: String(item?.challenge?.badgeIcon || '🎯'),
      missedDays,
      todayDay,
      durationDays,
    });
  }
  return result.sort((a, b) => b.missedDays.length - a.missedDays.length);
}
