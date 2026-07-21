/**
 * cheer-api — 응원(보내기/조회/리액션/답장/감사)·예약 응원 v1 통합 Lambda (Hono).
 * 보호 영역: /ch/* (API GW JWT authorizer). 퍼블릭 표면 없음.
 * 테이블: cheer (env CHEER_TABLE, RW) + challenges (env CHALLENGES_TABLE, READ-ONLY 예외 — PORTING.md §3).
 */
import { handle } from 'hono/aws-lambda';
import { createApi, ok, requireAuth } from '@chum7/api-kit';
import { cheerRoutes } from './routes/cheers';
import { reactionRoutes } from './routes/reactions';
import { scheduledRoutes } from './routes/scheduled';
import { statsRoutes } from './routes/stats';

export const app = createApi({ service: 'cheer-api' });

app.get('/health', (c) => ok(c, { service: 'cheer-api', at: new Date().toISOString() }));

// 보호 영역: /ch/*
app.use('/ch/*', requireAuth());

// 응원 (정적 세그먼트 /targets·/my·/thank 우선 매칭 후 :cheerId 파라미터 라우트)
app.route('/ch/cheers', cheerRoutes);
app.route('/ch/cheers', reactionRoutes);

// 예약 응원 목록/취소
app.route('/ch/scheduled', scheduledRoutes);

// 사용자 응원 통계 (레거시 stats-materializer 대체 — 증분 카운터 조회)
app.route('/ch/stats', statsRoutes);

export const handler = handle(app);
