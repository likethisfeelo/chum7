import { handle } from 'hono/aws-lambda';
import type { Context } from 'hono';
import { createApi, ok, requireAuth } from '@chum7/api-kit';
import { authRoutes } from './auth-routes';
import { getProfile, newUserProfile, putProfile } from './users-repo';
import { setOnboarded } from './repo/profile-repo';
import { profileRoutes } from './routes/profile';
import { notificationsRoutes } from './routes/notifications';
import { personalFeedRoutes, publicUsersRoutes } from './routes/personal-feed';
import { personalFeedContentRoutes } from './routes/personal-feed-content';
import { getPublicPushKey, pushRoutes } from './routes/push';
import { friendsRoutes } from './routes/friends';

const app = createApi({ service: 'user-api' });

// 퍼블릭: 헬스체크 (배포 검증용) + 인증 + 퍼블릭 프로필
app.get('/health', (c) => ok(c, { service: 'user-api', at: new Date().toISOString() }));
app.route('/auth', authRoutes);
app.route('/public/users', publicUsersRoutes);
app.get('/public/push/key', getPublicPushKey); // VAPID 공개키 (Web Push 구독용)

// 보호 영역: /u/* (API Gateway JWT authorizer 프록시 라우트)
app.use('/u/*', requireAuth());

app.get('/u/me', async (c) => {
  const { userId } = c.get('authUser')!;
  const profile = await getProfile(userId);
  if (!profile) {
    return c.json({ error: 'USER_NOT_FOUND', message: '사용자 정보를 찾을 수 없습니다' }, 404);
  }
  return ok(c, { user: profile });
});

/** JWT 클레임에서 `name`을 읽는다(소셜 IdP 속성 매핑 → idToken name 클레임). */
function claimName(c: Context): string | undefined {
  const anyEvent = c.env as { event?: { requestContext?: { authorizer?: { jwt?: { claims?: Record<string, unknown> } } } } };
  const name = anyEvent?.event?.requestContext?.authorizer?.jwt?.claims?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : undefined;
}

/**
 * POST /u/bootstrap — 소셜 로그인 최초 진입 시 프로필을 멱등 생성한다.
 * 소셜 유저는 /auth/register를 거치지 않아 프로필 행이 없다. 팝업 콜백 이후
 * 프론트가 이 엔드포인트를 호출해 프로필을 확보하고 user 객체를 받는다.
 */
app.post('/u/bootstrap', async (c) => {
  const { userId, email } = c.get('authUser')!;
  const existing = await getProfile(userId);
  if (existing) return ok(c, { user: existing });

  const name = claimName(c) || (email ? email.split('@')[0]! : '') || '회원';
  const profile = newUserProfile(userId, email ?? '', name);
  await putProfile(profile);
  return ok(c, { user: profile }, '프로필이 생성되었습니다', 201);
});

// POST /u/onboarding/complete — 온보딩 완료 기록 (관심 카테고리 최대 3개)
app.post('/u/onboarding/complete', async (c) => {
  const { userId } = c.get('authUser')!;
  const body = (await c.req.json().catch(() => ({}))) as { interests?: string[] };
  const interests = Array.isArray(body.interests)
    ? [...new Set(body.interests.filter((s) => typeof s === 'string' && s).map(String))].slice(0, 3)
    : [];
  const nowIso = new Date().toISOString();
  await setOnboarded(userId, interests, nowIso);
  return ok(c, { onboardedAt: nowIso, interests });
});

app.route('/u', profileRoutes); // PATCH /u/me
app.route('/u/notifications', notificationsRoutes);
app.route('/u/feed', personalFeedRoutes); // 프로필·팔로우·차단·핸들·공개 설정
app.route('/u/feed', personalFeedContentRoutes); // 자유글·저장 게시물·초대 링크
app.route('/u/push-subscriptions', pushRoutes);
app.route('/u/friends', friendsRoutes); // 친구 관계·추천 (P2 단계 B)

export const handler = handle(app);
