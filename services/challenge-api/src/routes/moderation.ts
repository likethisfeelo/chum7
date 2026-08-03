/**
 * 관리자 모더레이션 — /c/mod/* (requireGroup admins/operators).
 *  인증(verification) 숨기기/복원. '순수 숨기기' — 점수/진행은 유지하고 공개면에서만 제거.
 *  개인 프로필 피드(me/profile-feed·레거시 mine)는 무필터라 본인에겐 그대로 남는다.
 *  courtyard 마당글 연쇄 숨김은 verification.hidden 이벤트 → plaza-converter.
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail, requireGroup, publishEvent } from '@chum7/api-kit';
import { certDateFromIso, DEFAULT_TIMEZONE } from '../domain/day-sync';
import { findChallengeVerificationById, updateVerificationFields } from '../repo/verifications';

export const moderationRoutes = new Hono<AppEnv>();

moderationRoutes.use('*', requireGroup('admins', 'operators'));

// 인증 숨기기 — hiddenByAdmin 마커 + VFPUB(gsi2) 파티션에서 제거(전역피드·world·plaza 이탈)
moderationRoutes.put('/verifications/:verificationId/hide', async (c) => {
  const { userId } = c.get('authUser')!;
  const verificationId = c.req.param('verificationId');
  const body = await c.req.json().catch(() => ({} as any));
  const challengeId = String(body.challengeId || '');
  if (!challengeId) return fail(c, 400, 'VALIDATION_ERROR', 'challengeId가 필요합니다');

  const vf = await findChallengeVerificationById(challengeId, verificationId);
  if (!vf) return fail(c, 404, 'VERIFICATION_NOT_FOUND', '인증을 찾을 수 없습니다');
  if (vf.hiddenByAdmin === true) return ok(c, { verificationId, hidden: true }, '이미 숨긴 인증이에요');

  const nowIso = new Date().toISOString();
  await updateVerificationFields(
    { pk: String(vf.pk), sk: String(vf.sk) },
    { hiddenByAdmin: true, hiddenAt: nowIso, hiddenBy: userId, updatedAt: nowIso },
    ['gsi2pk', 'gsi2sk'], // VFPUB#<date> 파티션에서 제거 → 공개면 노출 중단 (점수/isPublic 불변)
  );

  await publishEvent('verification.hidden', {
    verificationId,
    challengeId,
    userId: String(vf.userId ?? ''),
    day: typeof vf.day === 'number' ? vf.day : 0,
    plazaConverted: Boolean(vf.plazaConvertedAt),
  });

  return ok(c, { verificationId, hidden: true }, '인증을 숨겼어요');
});

// 인증 숨김 복원 — 공개(isPublic·비개인)였다면 VFPUB 키 복원
moderationRoutes.put('/verifications/:verificationId/unhide', async (c) => {
  const verificationId = c.req.param('verificationId');
  const body = await c.req.json().catch(() => ({} as any));
  const challengeId = String(body.challengeId || '');
  if (!challengeId) return fail(c, 400, 'VALIDATION_ERROR', 'challengeId가 필요합니다');

  const vf = await findChallengeVerificationById(challengeId, verificationId);
  if (!vf) return fail(c, 404, 'VERIFICATION_NOT_FOUND', '인증을 찾을 수 없습니다');

  const nowIso = new Date().toISOString();
  const attrs: Record<string, unknown> = { hiddenByAdmin: false, updatedAt: nowIso };
  const wasPublic = (vf.isPublic === 'true' || vf.isPublic === true) && vf.isPersonalOnly !== true;
  if (wasPublic && vf.createdAt) {
    attrs.gsi2pk = `VFPUB#${certDateFromIso(String(vf.createdAt), DEFAULT_TIMEZONE)}`;
    attrs.gsi2sk = String(vf.createdAt);
  }
  await updateVerificationFields({ pk: String(vf.pk), sk: String(vf.sk) }, attrs);

  return ok(c, { verificationId, hidden: false }, '인증 숨김을 해제했어요');
});
