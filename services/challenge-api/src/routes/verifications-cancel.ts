/**
 * 인증 취소 라우트 — PUT /c/verifications/:verificationId/cancel
 * 정책: docs/core-specs/09-verification-cancel-policy.md
 *
 * "인증 취소" = 게시물 삭제가 아니라, 그 게시물이 채운 '해당 일자 완료·점수'를 떼어내는 것.
 *  - 게시물(콘텐츠)은 남고, 노출은 선택(챌린지 피드/개인 프로필 피드 숨김 옵션). 마당(plaza)은 항상 유지.
 *  - 해당 day를 재판정 → 미완이면 점수 0. 총점·연속일수 재계산(연속 끊김 허용).
 *  - 그 일자 보완(remedy)을 특별 개방(remedyUnlocked) → 정상 창 밖이어도 보완 가능.
 *  - 완주(뱃지 발급, participation.status='completed') 이후에는 취소 불가(조회 전용).
 *  - 복구 불가. 리더에게 알림(verification.self_cancelled).
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail, publishEvent } from '@chum7/api-kit';
import { cancelVerificationSchema } from '../schemas';
import { resolveDurationDays } from '../domain/day-sync';
import { normalizeProgress } from '../domain/progress';
import { createDayCompletionRules } from '../domain/verification-rules';
import { getChallenge } from '../repo/challenges';
import { getParticipation, updateParticipationFields } from '../repo/participations';
import { listQuests } from '../repo/quests';
import { findMyVerificationById, updateVerificationFields } from '../repo/verifications';

export const verificationCancelRoutes = new Hono<AppEnv>();

verificationCancelRoutes.put('/:verificationId/cancel', async (c) => {
  const { userId } = c.get('authUser')!;
  const verificationId = c.req.param('verificationId');
  const input = cancelVerificationSchema.parse(await c.req.json().catch(() => ({})));

  // 본인 인증만 (findMyVerificationById 가 gsi1 VFUSER# 파티션으로 소유권 내장)
  const vf = await findMyVerificationById(userId, verificationId);
  if (!vf) return fail(c, 404, 'VERIFICATION_NOT_FOUND', '인증을 찾을 수 없습니다');
  if (vf.scoreCancelled === true) return fail(c, 409, 'ALREADY_CANCELLED', '이미 취소한 인증이에요');

  const challengeId = String(vf.challengeId ?? '');
  if (!challengeId) return fail(c, 400, 'MISSING_CHALLENGE', '챌린지 정보가 없어 취소할 수 없어요');
  const day = Number(vf.day);
  const questType = String(vf.questType ?? '');
  const questId = vf.questId ? String(vf.questId) : null;
  const nowIso = new Date().toISOString();

  const [challenge, participation] = await Promise.all([
    getChallenge(challengeId),
    getParticipation(challengeId, userId),
  ]);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');

  // 완주(뱃지 발급) 이후에는 취소 불가 — 챌린지 피드 조회 전용 (뱃지 회수 이슈 차단)
  if (participation?.status === 'completed') {
    return fail(c, 409, 'CHALLENGE_COMPLETED_READONLY', '완주한 챌린지는 인증을 취소할 수 없어요 (조회 전용)');
  }

  const leaderId = String(challenge.createdBy || challenge.creatorId || challenge.leaderId || '');

  // 1) 인증 아이템 — 취소 마커 + 노출 옵션 반영. gsi1(기록)은 유지.
  const attrs: Record<string, unknown> = {
    scoreCancelled: true,
    cancelledAt: nowIso,
    score: 0,
    scoreEarned: 0,
    updatedAt: nowIso,
  };
  const removeAttrs: string[] = [];
  if (input.hideFromChallengeFeed) {
    // 챌린지·공개 피드에서 제거(공개 인덱스 이탈). 마당(plaza)은 별도 삭제요청 영역이라 건드리지 않음.
    attrs.isPublic = 'false';
    attrs.isPersonalOnly = true;
    removeAttrs.push('gsi2pk', 'gsi2sk');
  }
  if (input.hideFromOwnerFeed) {
    // 개인 프로필 피드(me/profile-feed·mine)는 무필터라 이 플래그로 제외한다.
    attrs.removedFromOwnerFeed = true;
  }
  await updateVerificationFields({ pk: String(vf.pk), sk: String(vf.sk) }, attrs, removeAttrs);

  // 2) 진행 기록 — 해당 day에서 이 게시물 기여 제거 → 재판정 + remedy 특별 개방 + 집계 재계산.
  let dayNowIncomplete = false;
  try {
    if (participation && Number.isFinite(day)) {
      const challengeType = String(challenge.challengeType || 'leader_personal');
      const quests = await listQuests(challengeId);
      const totalLeaderQuestIds = quests
        .filter((q) => q.status === 'active' && q.questScope !== 'personal')
        .map((q) => String(q.questId));
      const rules = createDayCompletionRules({ challengeType, totalLeaderQuestIds, leaderQuestsFetched: true });

      const progress = normalizeProgress(participation.progress);
      const durationDays = resolveDurationDays(challenge.durationDays, progress);
      const updated = progress.map((entry: any) => {
        if (Number(entry.day) !== day) return entry;
        const next: any = { ...entry };
        // 이 게시물의 기여 제거
        if (questType === 'personal') {
          next.personalQuestDone = false;
          if (next.personalVerificationId === verificationId) delete next.personalVerificationId;
        } else if (questType === 'leader') {
          const ids: string[] = Array.isArray(next.leaderQuestIds) ? next.leaderQuestIds : [];
          next.leaderQuestIds = questId ? ids.filter((id) => id !== questId) : ids;
          next.leaderQuestDone = rules.isLeaderAllDone(next);
          if (next.leaderVerificationId === verificationId) delete next.leaderVerificationId;
        }
        if (next.verificationId === verificationId) delete next.verificationId;

        // 재판정 — 리더 수동 완료 인정(leaderGrantedComplete)이 있으면 유지.
        const complete = next.leaderGrantedComplete === true || rules.isDayComplete(next);
        if (!complete) {
          next.status = 'partial';
          next.score = 0;
          next.remedyUnlocked = true; // 취소된 일자의 보완을 특별 개방
          dayNowIncomplete = true;
        }
        return next;
      });

      if (dayNowIncomplete || questType) {
        const totalScore = updated
          .filter((p: any) => p.status === 'success')
          .reduce((s: number, p: any) => s + (Number(p.score) || 0), 0);
        let consecutive = 0;
        for (let d = 1; d <= durationDays; d += 1) {
          const e = updated.find((p: any) => Number(p.day) === d);
          if (e && e.status === 'success') consecutive += 1;
          else break;
        }
        await updateParticipationFields(challengeId, userId, {
          progress: updated,
          score: totalScore,
          consecutiveDays: consecutive,
          updatedAt: nowIso,
        });
      }
    }
  } catch (err: any) {
    console.error('cancel verification: progress recompute error (non-fatal):', err?.message);
  }

  // 3) 리더 알림 — 스탯 영향 인지 (알림워커 rate-limit로 스팸 완화). 마당(plaza)은 유지되므로 변환분은 건드리지 않음.
  if (leaderId && leaderId !== userId) {
    try {
      await publishEvent('verification.self_cancelled', {
        verificationId,
        challengeId,
        userId,
        leaderId,
        day: Number.isFinite(day) ? day : 0,
      });
    } catch (err: any) {
      console.error('cancel verification: publish event error (non-fatal):', err?.message);
    }
  }

  return ok(
    c,
    {
      verificationId,
      day: Number.isFinite(day) ? day : null,
      scoreCancelled: true,
      dayNowIncomplete,
      remedyUnlocked: dayNowIncomplete,
      hiddenFromChallengeFeed: Boolean(input.hideFromChallengeFeed),
      hiddenFromOwnerFeed: Boolean(input.hideFromOwnerFeed),
    },
    dayNowIncomplete
      ? '인증을 취소했어요. 해당 일자 점수가 빠지고, 그 날 보완이 특별히 열렸어요.'
      : '인증을 취소했어요.',
  );
});
