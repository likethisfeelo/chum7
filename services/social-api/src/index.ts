/**
 * social-api — 마당(plaza)·챌린지보드·챌린지 피드 상호작용·불레틴·해시태그 v1 통합 Lambda (Hono).
 * 보호 영역: /s/* (API GW JWT authorizer), 퍼블릭: /public/{plaza,board,hashtags}...
 * 테이블: social (env SOCIAL_TABLE) 단일 — 키 설계는 이전 가이드 §3 social.
 */
import { handle } from 'hono/aws-lambda';
import { createApi, ok, requireAuth } from '@chum7/api-kit';
import { plazaPublicRoutes, plazaRoutes } from './routes/plaza';
import { boardPublicRoutes, boardRoutes } from './routes/board';
import { challengeFeedRoutes } from './routes/challenge-feed';
import { bulletinRoutes } from './routes/bulletin';
import { hashtagPublicRoutes, hashtagRoutes } from './routes/hashtags';

const app = createApi({ service: 'social-api' });

// 퍼블릭: 헬스체크 + 마당 열람 + 프리뷰 보드 + 해시태그 열람
app.get('/health', (c) => ok(c, { service: 'social-api', at: new Date().toISOString() }));
app.route('/public/plaza', plazaPublicRoutes);
app.route('/public/board', boardPublicRoutes);
app.route('/public/hashtags', hashtagPublicRoutes);

// 보호 영역: /s/*
app.use('/s/*', requireAuth());

app.route('/s/plaza', plazaRoutes);
app.route('/s/board', boardRoutes);
app.route('/s/challenge-feed', challengeFeedRoutes);
app.route('/s/bulletin', bulletinRoutes);
app.route('/s/hashtags', hashtagRoutes);

export const handler = handle(app);
