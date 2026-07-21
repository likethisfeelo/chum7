import { handle } from 'hono/aws-lambda';
import { createApi, ok, requireAuth, requireGroup } from '@chum7/api-kit';
import { orderRoutes } from './routes/orders';
import { commerceAdminRoutes } from './routes/admin';

/**
 * commerce-api v0 — PG 계약 전 수동 운영 (PAYMENT_SPEC 참조, COMMERCE_V0.md에 v0 범위 기록).
 * 쿠폰(슈퍼어드민 발급, 멤버 지정 가능) + 수동 입금 확인으로 유료 챌린지를 연다.
 * PG 도입 시 /hooks/pg 웹훅이 어드민 confirm과 동일한 상태 전이를 수행한다.
 */
const app = createApi({ service: 'commerce-api' });

app.get('/health', (c) => ok(c, { service: 'commerce-api', at: new Date().toISOString() }));

// 보호 영역: /pay/*
app.use('/pay/*', requireAuth());
// 슈퍼어드민 영역: /pay/admin/*
app.use('/pay/admin/*', requireGroup('admins'));

app.route('/pay/admin', commerceAdminRoutes);
app.route('/pay/orders', orderRoutes);

export const handler = handle(app);
