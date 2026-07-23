import { handle } from 'hono/aws-lambda';
import { createApi, ok, requireAuth } from '@chum7/api-kit';
import { authRoutes } from './auth-routes';
import { getProfile } from './users-repo';
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

app.route('/u', profileRoutes); // PATCH /u/me
app.route('/u/notifications', notificationsRoutes);
app.route('/u/feed', personalFeedRoutes); // 프로필·팔로우·차단·핸들·공개 설정
app.route('/u/feed', personalFeedContentRoutes); // 자유글·저장 게시물·초대 링크
app.route('/u/push-subscriptions', pushRoutes);
app.route('/u/friends', friendsRoutes); // 친구 관계·추천 (P2 단계 B)

export const handler = handle(app);
