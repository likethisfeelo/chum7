/**
 * 보완(remedy) 상태 공용 유틸 — "오늘이 Day 몇인지"와 "놓친 Day 목록"의 단일 소스.
 * 서버 저장 currentDay는 phase 전이 지연 등으로 갱신이 밀릴 수 있어(0/1 고착),
 * 클라이언트에서 시작일 기준 KST 달력으로 직접 계산한다
 * (ChallengeFeedPage 진행현황 그리드와 동일 로직 — 이관).
 */
import { getRemainingRemedyCount, getRemedyType } from './flowPolicy';

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

export function durationDaysOf(item: any): number {
  return (
    Number(item?.durationDays || item?.challenge?.durationDays || 0) ||
    (Array.isArray(item?.progress) ? item.progress.length : 7)
  );
}

/**
 * 지나간 날짜 중 미완료·미보완 Day 목록.
 * 오늘은 제외 — 아직 일반 인증으로 채울 수 있는 날이라 보완 대상이 아니다.
 * 종료 다음날(todayDay = durationDays+1)에는 마지막 날까지 포함되어,
 * 마지막 날을 놓쳐도 하루의 유예 안에서 복구할 수 있다.
 */
export function missedDaysOf(item: any): number[] {
  const todayDay = computeTodayChallengeDay(item);
  const bound = Math.min(todayDay, durationDaysOf(item) + 1);
  return (Array.isArray(item?.progress) ? item.progress : [])
    .filter((p: any) => Number(p?.day) < bound && p?.status !== 'success' && !p?.remedied)
    .map((p: any) => Number(p.day))
    .sort((a: number, b: number) => a - b);
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
 * 상태로 거르지 않고 기간으로 거른다 — 마지막 날을 놓치면 참여 상태가 failed로
 * 자동 확정되지만, 종료 다음날까지는 보완해서 완주로 되돌릴 수 있어야 하기 때문.
 * (중도 포기·해산은 제외, 종료 이틀 뒤부터는 목록에서 빠진다.)
 */
export function collectMissedChallenges(items: any[]): MissedChallenge[] {
  const result: MissedChallenge[] = [];
  for (const item of items || []) {
    if (String(item?.status) === 'gave_up' || String(item?.phase) === 'gave_up') continue;
    if (item?.challenge?.disbanded === true) continue;
    const remedyType = getRemedyType(item?.remedyPolicy);
    if (remedyType === 'disabled') continue;
    const todayDay = computeTodayChallengeDay(item);
    const durationDays = durationDaysOf(item);
    if (todayDay > durationDays + 1) continue; // 종료 후 유예(하루) 경과
    // 마지막날 전용 정책은 서버가 그 날 하루만 창을 여니 유예를 적용하지 않는다
    if (remedyType === 'last_day' && todayDay !== durationDays) continue;
    const remaining = getRemainingRemedyCount(item?.remedyPolicy, item?.progress || []);
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
