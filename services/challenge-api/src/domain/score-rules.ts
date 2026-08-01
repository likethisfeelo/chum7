/**
 * 응원(cheerScore)·감사(thankScore) 점수 적립 순수 로직 — 레거시 verification/submit 이식.
 * 설계: docs/cheer-thank-system.md.
 *
 * 레거시는 조기완료 시 미완료 팀원에게 auto-cheer를 "발송"하고 점수를 적립했지만,
 * 점수 자체는 **완료 순서만으로 결정적으로 재현**된다 (응원 레코드 불필요):
 *  - 분기 C(감사): 내가 day를 완료하면, 그 전에 "조기완료"한 팀원들이 나를 응원한 것이므로
 *    그들에게 thankScore +1. (내 delta 무관 — 완료만 하면 됨)
 *  - 분기 A(응원): 내가 "조기완료"했고 아직 미완료 팀원이 있으면 그 수만큼 cheerScore. (리더 ×10)
 *  - 분기 B(전원완료 보너스): 내가 "조기완료"로 마지막 완료자가 되면, 전원(자신 포함) 수만큼
 *    마지막 완료자 thankScore + cheerScore, 그 외 active 멤버 cheerScore. (cheerScore만 리더 ×10)
 *
 * 호출부(인증 제출 핸들러)가 day 완료/조기 판정을 수행해 아래 집합을 넘긴다 (혼합형 questType 규칙 포함).
 */

export interface ScoreDelta {
  userId: string;
  cheerScore: number;
  thankScore: number;
}

export interface ComputeScoreInput {
  /** 방금 day를 완료한 유저 */
  completerId: string;
  /** 챌린지 생성자(리더) — cheerScore ×10 배수 대상 */
  creatorId: string | null;
  /** active 참여자 userId 전체 (완료자 포함) */
  activeUserIds: string[];
  /** 이 완료 반영 후 해당 day를 완료한 userId 집합 (완료자 포함) */
  completedUserIds: Set<string>;
  /** 해당 day를 "조기완료"(delta>0)한 userId 집합 (완료자 포함 가능) */
  earlyCompletedUserIds: Set<string>;
  /** 리더 cheerScore 배수 (기본 10) */
  creatorMultiplier?: number;
}

/**
 * 점수 델타 목록을 반환한다 (userId별 cheerScore/thankScore 증분, 0 증분은 제외).
 * 멱등성: 호출부가 "day가 이번에 처음 완료됐을 때만" 1회 호출해야 한다 (재제출/추가인증 제외).
 */
export function computeScoreDeltas(input: ComputeScoreInput): ScoreDelta[] {
  const {
    completerId,
    creatorId,
    activeUserIds,
    completedUserIds,
    earlyCompletedUserIds,
  } = input;
  const MULT = input.creatorMultiplier ?? 10;
  const mult = (uid: string) => (creatorId && uid === creatorId ? MULT : 1);

  const acc = new Map<string, ScoreDelta>();
  const bump = (userId: string, field: 'cheerScore' | 'thankScore', amount: number) => {
    if (amount === 0) return;
    const cur = acc.get(userId) ?? { userId, cheerScore: 0, thankScore: 0 };
    cur[field] += amount;
    acc.set(userId, cur);
  };

  const activeSet = new Set(activeUserIds);
  const others = activeUserIds.filter((u) => u !== completerId);

  // 분기 C — 나보다 먼저 조기완료한(=나를 응원한) 팀원에게 감사 점수 (완료자 delta 무관)
  for (const u of others) {
    if (earlyCompletedUserIds.has(u) && completedUserIds.has(u)) {
      bump(u, 'thankScore', 1);
    }
  }

  // 분기 A/B — 완료자가 조기완료했을 때만
  const completerEarly = earlyCompletedUserIds.has(completerId);
  if (completerEarly) {
    const incompleteOthers = others.filter((u) => !completedUserIds.has(u));
    if (incompleteOthers.length > 0) {
      // 분기 A — 미완료 팀원 수만큼 즉시 적립
      bump(completerId, 'cheerScore', incompleteOthers.length * mult(completerId));
    } else {
      // 분기 B — 전원완료 보너스 (완료자가 마지막)
      const completedActiveCount = activeUserIds.filter((u) => completedUserIds.has(u)).length;
      bump(completerId, 'thankScore', completedActiveCount);
      bump(completerId, 'cheerScore', completedActiveCount * mult(completerId));
      for (const u of others) {
        if (!activeSet.has(u)) continue;
        bump(u, 'cheerScore', completedActiveCount * mult(u));
      }
    }
  }

  return [...acc.values()];
}
