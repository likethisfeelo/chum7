/**
 * lifecycle-manager — 챌린지 라이프사이클 워커 (EventBridge 매 1시간, plain Lambda handler).
 * 레거시 backend/services/challenge/lifecycle-manager 이식 (상세: PORTING.md).
 *
 *  1. gsi1 `LC#<lifecycle>#CAT#<category>` Query (recruiting/preparing/active × 8 카테고리)
 *  2. `@chum7/core` resolveDueLifecycle + canTransition으로 전이 (META lifecycle + gsi1pk 동기화)
 *  3. active 진입: actualStartAt/challengeEndAt 동기화 + 승인 참여자 활성화·미승인 자동 거절
 *  4. active→completed: 참여자 완주/실패 확정 + 완주자 캐릭터 슬롯 + 리더 뱃지 조건부 부여
 *     + publishEvent('challenge.completed', { challengeId, completedUserIds })
 *
 * 테이블: challenges(RW) + gamification(W) — 문서화된 크로스 도메인 예외 (이전 가이드 §4).
 */
import type { EventBridgeEvent } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { publishEvent } from '@chum7/api-kit';
import { buildSpecificBadgeItem } from './domain/badge-grant';
import { decideSlotFill, isMythologyCompleted } from './domain/character-slot';
import {
  calculateChallengeEndAt,
  resolveChallengeActualStartAt,
  resolveDurationDays,
} from './domain/day-sync';
import { evaluateLeaderBadgeIds } from './domain/leader-badge-grant';
import {
  buildLeaderChallengeSummary,
  decideActivation,
  decideTransition,
  finalizeParticipants,
  MANAGED_LIFECYCLES,
  type ChallengeLike,
} from './domain/lifecycle-run';
import * as repo from './repo';

/** 카테고리 8종 — gamification world-summary LAYER_ORDER와 동일 집합 (challenges gsi1 파티션 열거용) */
const CATEGORIES = [
  'health', 'mindfulness', 'habit', 'relationship', 'creativity', 'development', 'expand', 'impact',
] as const;

interface RunSummary {
  scanned: number;
  transitioned: number;
  held: number;
  raceSkipped: number;
  failed: number;
  completedChallenges: number;
  completedUsers: number;
  leaderBadgesGranted: number;
}

/** active 진입 참여자 처리 — 승인 활성화(currentDay=1) + requested 자동 거절 (레거시 승계, 알림·환불 제외) */
async function activateParticipants(challenge: ChallengeLike, nowIso: string): Promise<void> {
  const participants = await repo.listParticipations(challenge.challengeId);
  let rejectedCount = 0;
  for (const uc of participants) {
    if (!uc.userId) continue;
    const decision = decideActivation(uc);
    if (decision === 'activate') {
      await repo.updateParticipation(challenge.challengeId, uc.userId, {
        phase: 'active',
        currentDay: 1,
        updatedAt: nowIso,
      });
    } else if (decision === 'reject') {
      await repo.updateParticipation(challenge.challengeId, uc.userId, {
        status: 'failed',
        joinStatus: 'rejected',
        phase: 'failed',
        updatedAt: nowIso,
      });
      rejectedCount += 1;
    }
  }
  await repo.decrementPendingParticipants(challenge.challengeId, rejectedCount, nowIso);
}

/** 완주자 1명의 캐릭터 슬롯 채우기 (레거시 fillCharacterSlot — gamification 테이블판) */
async function fillCharacterSlot(userId: string, challengeId: string, nowIso: string): Promise<void> {
  const state = await repo.getCharacterState(userId);
  const activeCharacterId =
    typeof state?.activeCharacterId === 'string' && state.activeCharacterId
      ? state.activeCharacterId
      : null;
  const activeCharacter = activeCharacterId
    ? (await repo.getCharacter(userId, activeCharacterId)) ?? null
    : null;

  const decision = decideSlotFill({
    userId,
    challengeId,
    hasActiveCharacterId: activeCharacterId !== null,
    activeCharacter,
    badgeId: randomUUID(),
    now: nowIso,
  });

  if (decision.action === 'accumulatePending') {
    await repo.incrementPendingSlotFills(userId, nowIso);
    return;
  }
  if (decision.action === 'none') return;

  const characterSk = `CHAR#${activeCharacterId}`;
  if (decision.action === 'fill') {
    await repo.updateGamificationItem(userId, characterSk, {
      slots: decision.slots,
      filledCount: decision.filledCount,
    });
    return;
  }

  // complete: 캐릭터 완성 → 상태 초기화 + 세계관 완성 체크 (레거시 checkMythologyCompletion)
  await repo.updateGamificationItem(userId, characterSk, {
    slots: decision.slots,
    filledCount: decision.filledCount,
    status: 'complete',
    completedAt: decision.completedAt,
  });

  const mythologyLine = activeCharacter?.mythologyLine ?? '';
  const characters = await repo.listCharacters(userId);
  const completedCount = characters.filter(
    (c) =>
      c.mythologyLine === mythologyLine &&
      (c.status === 'complete' || c.characterId === activeCharacterId),
  ).length;

  const stateAttrs: Record<string, unknown> = { activeCharacterId: null, updatedAt: nowIso };
  if (isMythologyCompleted(mythologyLine, completedCount)) {
    const existing = Array.isArray(state?.completedMythologies) ? state!.completedMythologies : [];
    stateAttrs.completedMythologies = [...new Set([...existing, mythologyLine])];
  }
  await repo.updateGamificationItem(userId, 'CHARACTER', stateAttrs);
}

/** 리더 뱃지 조건 체크 + 조건부 부여 (레거시 checkAndGrantLeaderBadges) */
async function grantLeaderBadges(challenge: ChallengeLike, now: Date): Promise<string[]> {
  const leaderId = challenge.createdBy!;
  const completedChallenges = await repo.listCompletedChallengesByCreator(leaderId);
  const summaries = [];
  for (const c of completedChallenges) {
    const participants = await repo.listParticipations(String(c.challengeId));
    summaries.push(buildLeaderChallengeSummary(c as ChallengeLike, participants));
  }

  const granted: string[] = [];
  for (const badgeId of evaluateLeaderBadgeIds(summaries, challenge.challengeId)) {
    const item = buildSpecificBadgeItem(
      { badgeId, userId: leaderId, challengeId: challenge.challengeId, metadata: { source: 'leader' } },
      now,
    );
    if (await repo.putBadgeIfAbsent(item)) granted.push(badgeId);
  }
  return granted;
}

/** active→completed 마무리: 참여자 확정 + 완주자 슬롯 + 리더 뱃지 + 이벤트 발행 */
async function completeChallenge(challenge: ChallengeLike, now: Date, summary: RunSummary): Promise<void> {
  const nowIso = now.toISOString();
  const durationDays = resolveDurationDays(challenge.durationDays, undefined);
  const participants = await repo.listParticipations(challenge.challengeId);
  const { finals, completedUserIds } = finalizeParticipants(participants, durationDays);

  for (const final of finals) {
    await repo.updateParticipation(challenge.challengeId, final.userId, {
      phase: final.finalStatus,
      status: final.finalStatus,
      updatedAt: nowIso,
    });
  }

  for (const userId of completedUserIds) {
    try {
      await fillCharacterSlot(userId, challenge.challengeId, nowIso);
    } catch (err: any) {
      console.error(JSON.stringify({ level: 'error', message: 'fillCharacterSlot failed', userId, challengeId: challenge.challengeId, error: err?.message ?? String(err) }));
    }
  }

  if (challenge.createdBy) {
    try {
      const granted = await grantLeaderBadges(challenge, now);
      summary.leaderBadgesGranted += granted.length;
      if (granted.length > 0) {
        console.log(JSON.stringify({ level: 'info', message: 'leader badges granted', leaderId: challenge.createdBy, badgeIds: granted }));
      }
    } catch (err: any) {
      console.error(JSON.stringify({ level: 'error', message: 'leader badge check failed', challengeId: challenge.challengeId, error: err?.message ?? String(err) }));
    }
  }

  // 이벤트는 통지 — publishEvent 실패는 내부 로깅만 (api-kit 정책)
  await publishEvent('challenge.completed', { challengeId: challenge.challengeId, completedUserIds });
  summary.completedChallenges += 1;
  summary.completedUsers += completedUserIds.length;
}

/** 챌린지 1건 전이 처리 (2단계 경로 지원: 예 preparing→active→completed) */
async function processChallenge(challenge: ChallengeLike, now: Date, summary: RunSummary): Promise<void> {
  const decision = decideTransition(challenge, now);
  if (decision.action === 'none') return;
  if (decision.action === 'hold') {
    summary.held += 1;
    return;
  }

  const nowIso = now.toISOString();
  const durationDays = resolveDurationDays(challenge.durationDays, undefined);
  let from = challenge.lifecycle;
  for (const step of decision.steps) {
    const activation =
      step === 'active'
        ? (() => {
            const actualStartAt = resolveChallengeActualStartAt(challenge) || nowIso;
            return { actualStartAt, challengeEndAt: calculateChallengeEndAt(actualStartAt, durationDays) };
          })()
        : undefined;

    try {
      await repo.transitionChallenge({
        challengeId: challenge.challengeId,
        category: String(challenge.category ?? 'habit'),
        from,
        to: step,
        nowIso,
        activation,
      });
    } catch (err: any) {
      if (err?.name === 'ConditionalCheckFailedException') {
        summary.raceSkipped += 1;
        return; // 동시 전이 — 다음 시간 주기에 재평가
      }
      throw err;
    }

    console.log(JSON.stringify({ level: 'info', message: 'challenge transitioned', challengeId: challenge.challengeId, from, to: step }));
    summary.transitioned += 1;

    if (step === 'active') await activateParticipants(challenge, nowIso);
    if (step === 'completed') await completeChallenge(challenge, now, summary);
    from = step;
  }
}

export const handler = async (event: EventBridgeEvent<string, unknown>) => {
  const now = new Date();
  console.log(JSON.stringify({ level: 'info', message: 'lifecycle-manager triggered', eventId: event.id, at: now.toISOString() }));

  const summary: RunSummary = {
    scanned: 0, transitioned: 0, held: 0, raceSkipped: 0, failed: 0,
    completedChallenges: 0, completedUsers: 0, leaderBadgesGranted: 0,
  };

  for (const lifecycle of MANAGED_LIFECYCLES) {
    for (const category of CATEGORIES) {
      const challenges = await repo.listChallengesByLifecycleCategory(lifecycle, category);
      for (const challenge of challenges) {
        summary.scanned += 1;
        try {
          await processChallenge(challenge as ChallengeLike, now, summary);
        } catch (err: any) {
          summary.failed += 1;
          console.error(JSON.stringify({ level: 'error', message: 'challenge processing failed', challengeId: challenge.challengeId, error: err?.message ?? String(err) }));
        }
      }
    }
  }

  console.log(JSON.stringify({ level: 'info', message: 'lifecycle-manager summary', ...summary }));
  return { statusCode: 200, body: JSON.stringify({ message: 'Lifecycle run complete', ...summary }) };
};
