/**
 * admin-api — 운영 콘솔 백엔드 v1 통합 Lambda (Hono).
 * 보호 영역: /adm/* (API GW JWT authorizer + Cognito 그룹 게이트).
 * 크로스 도메인 테이블 접근은 이전 가이드 §4 문서화된 예외 (grant는 필요한 테이블만):
 *   USERS_TABLE(R) · CHALLENGES_TABLE(RW) · CHEER_TABLE(RW) · CONTENT_TABLE(RW) · OPS_TABLE(RW)
 *   (SOCIAL_TABLE·GAMIFICATION_TABLE·EVENT_BUS_NAME은 예약 — v1 미사용, PORTING.md §4)
 */
import { handle } from 'hono/aws-lambda';
import { createApi, ok, requireAuth, requireGroup } from '@chum7/api-kit';
import { challengeAdminRoutes } from './routes/challenges';
import { questReviewRoutes } from './routes/quests';
import { bannerRoutes } from './routes/banners';
import { cheerOpsRoutes } from './routes/cheer-ops';
import { userAdminRoutes } from './routes/users';
import { statsRoutes } from './routes/stats';
import { auditRoutes } from './routes/audit';

const app = createApi({ service: 'admin-api' });

app.get('/health', (c) => ok(c, { service: 'admin-api', at: new Date().toISOString() }));

// 베이스 게이트: 인증 + 운영 그룹 (세부 권한은 라우트별 requireGroup/생성자 검사)
app.use('/adm/*', requireAuth());
app.use('/adm/*', requireGroup('admins', 'operators', 'creators'));

app.route('/adm/challenges', challengeAdminRoutes);
app.route('/adm/quests', questReviewRoutes);
app.route('/adm/category-banners', bannerRoutes);
app.route('/adm/cheer', cheerOpsRoutes);
app.route('/adm/users', userAdminRoutes);
app.route('/adm/stats', statsRoutes);
app.route('/adm/audit', auditRoutes);

export const handler = handle(app);
