import { handle } from 'hono/aws-lambda';
import { createApi, ok, requireAuth } from '@chum7/api-kit';
import { charactersRoutes } from './routes/characters';
import { badgesRoutes } from './routes/badges';
import { todayRoutes } from './routes/today';
import { bannersRoutes } from './routes/banners';
import { publicUsersRoutes } from './routes/public-users';

const app = createApi({ service: 'gamification-api' });

// 퍼블릭: 헬스체크 (배포 검증용) + 비로그인 조회
app.get('/health', (c) => ok(c, { service: 'gamification-api', at: new Date().toISOString() }));
app.route('/public/today', todayRoutes);
app.route('/public/banners', bannersRoutes);
app.route('/public/users', publicUsersRoutes);

// 보호 영역: /g/* (API Gateway JWT authorizer 프록시 라우트)
app.use('/g/*', requireAuth());
app.route('/g/characters', charactersRoutes);
app.route('/g/badges', badgesRoutes);

export const handler = handle(app);
