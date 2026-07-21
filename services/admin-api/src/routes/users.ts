/**
 * 어드민 사용자 조회 — 레거시 admin/user/list (USERS_TABLE Scan) 재작성.
 * 신규 users 테이블에는 전체 목록 접근 경로가 설계상 없음 (풀스캔 금지) —
 * v1은 gsi1 EMAIL# 단건 검색만 지원, 전체 목록은 운영 GSI 도입 후 (PORTING.md §3).
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, requireGroup } from '@chum7/api-kit';
import { findProfilesByEmail, getProfile } from '../repo/users';
import { stripKeys } from '../repo/shared';

export const userAdminRoutes = new Hono<AppEnv>();

// ── 사용자 검색 (레거시 GET /admin/users — admins 전용) ──
userAdminRoutes.get('/', requireGroup('admins'), async (c) => {
  const email = (c.req.query('email') ?? '').trim();
  const userId = (c.req.query('userId') ?? '').trim();

  if (email) {
    const users = (await findProfilesByEmail(email)).map(stripKeys);
    return ok(c, { users, lastKey: null, total: users.length });
  }
  if (userId) {
    const profile = await getProfile(userId);
    const users = profile ? [stripKeys(profile)] : [];
    return ok(c, { users, lastKey: null, total: users.length });
  }

  // NOT_IMPLEMENTED 성 응답 — 스캔 대신 빈 목록 + note (이전 가이드 §1-3 풀스캔 금지)
  return ok(c, {
    users: [],
    lastKey: null,
    total: 0,
    note: '전체 사용자 목록 조회는 운영용 GSI 도입 후 지원됩니다. email 또는 userId 파라미터로 단건 조회를 사용하세요.',
  });
});
