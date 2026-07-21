import { handle } from 'hono/aws-lambda';
import { createApi, ok, requireAuth } from '@chum7/api-kit';
import { authRoutes } from './auth-routes';
import { getProfile } from './users-repo';

const app = createApi({ service: 'user-api' });

// 퍼블릭: 헬스체크 (배포 검증용) + 인증
app.get('/health', (c) => ok(c, { service: 'user-api', at: new Date().toISOString() }));
app.route('/auth', authRoutes);

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

export const handler = handle(app);
