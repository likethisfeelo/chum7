/**
 * challenge-api — 챌린지·인증·퀘스트(유저)·리더 도구 v1 통합 Lambda (Hono).
 * 보호 영역: /c/* (API GW JWT authorizer), 퍼블릭: /public/challenges...
 * 테이블: challenges (env CHALLENGES_TABLE) 단일 — 키 설계는 이전 가이드 §3.
 */
import { handle } from 'hono/aws-lambda';
import { createApi, ok, requireAuth } from '@chum7/api-kit';
import { discoveryRoutes } from './routes/discovery';
import { challengeRoutes } from './routes/challenges';
import { participationRoutes } from './routes/participations';
import { myChallengeRoutes } from './routes/my-challenges';
import { verificationRoutes } from './routes/verifications';
import { verificationRemedyRoutes } from './routes/verifications-remedy';
import { verificationReadRoutes } from './routes/verifications-read';
import { questRoutes } from './routes/quests';
import { leaderRoutes } from './routes/leader';
import { publicUserRoutes } from './routes/public-users';
import { linkPreviewRoutes } from './routes/link-preview';
import { interestRoutes } from './routes/interest';
import { questProposalRoutes } from './routes/quest-proposals';

const app = createApi({ service: 'challenge-api' });

// 퍼블릭: 헬스체크 + 탐색/상세/통계 + 사용자 공개 이력 + 링크 프리뷰
app.get('/health', (c) => ok(c, { service: 'challenge-api', at: new Date().toISOString() }));
app.route('/public/challenges', discoveryRoutes);
app.route('/public/users', publicUserRoutes);
app.route('/public/link-preview', linkPreviewRoutes);

// 보호 영역: /c/*
app.use('/c/*', requireAuth());

// 인증 (정적 세그먼트 — /c/:challengeId 파라미터 라우트보다 우선 매칭)
app.route('/c/verifications', verificationRoutes);
app.route('/c/verifications', verificationRemedyRoutes);
app.route('/c/verifications', verificationReadRoutes);

// 챌린지 생성/수정/공개 + 참여 + 내 챌린지 + 관심 토글 + 개인 퀘스트 제안
app.route('/c/challenges', challengeRoutes);
app.route('/c/challenges', interestRoutes);
app.route('/c/challenges', questProposalRoutes);
app.route('/c', myChallengeRoutes);
app.route('/c', participationRoutes);

// 퀘스트(유저) + 리더 도구
app.route('/c/:challengeId/quests', questRoutes);
app.route('/c/:challengeId/leader', leaderRoutes);

export const handler = handle(app);
