import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '@chum7/api-kit';

/**
 * 채팅 입장 자격 — challenges 테이블 읽기 전용(문서화된 크로스 도메인 예외).
 * "준비중(모집중/준비기간) 챌린지의 참여자" 만 입장 가능하다:
 *  - 챌린지 lifecycle 이 recruiting | preparing (시작 전) — META 조회
 *  - 참여 레코드가 존재하고 중도포기/실패/거절 상태가 아님 — 참여(UC) 조회
 *  키: pk=`CHAL#<challengeId>`, sk=`META`(챌린지) / `UC#<userId>`(참여).
 */
const CHAT_LIFECYCLES = new Set(['recruiting', 'preparing']);
const EXCLUDED_STATUSES = new Set(['gave_up', 'failed', 'rejected']);

export async function getChatEligibility(
  challengeId: string,
  userId: string,
): Promise<{ eligible: boolean; status?: string; lifecycle?: string; isLeader: boolean }> {
  const table = process.env.CHALLENGES_TABLE;
  if (!table) throw new Error('Missing table env: CHALLENGES_TABLE');

  const [partRes, metaRes] = await Promise.all([
    docClient.send(
      new GetCommand({
        TableName: table,
        Key: { pk: `CHAL#${challengeId}`, sk: `UC#${userId}` },
        ProjectionExpression: '#s, phase',
        ExpressionAttributeNames: { '#s': 'status' },
      }),
    ),
    docClient.send(
      new GetCommand({
        TableName: table,
        Key: { pk: `CHAL#${challengeId}`, sk: 'META' },
        // leaderId 미기록 레거시는 createdBy 로 대체 (routes/challenges.ts 와 동일 규칙)
        ProjectionExpression: 'lifecycle, leaderId, createdBy',
      }),
    ),
  ]);

  const part = partRes.Item;
  const meta = metaRes.Item;
  if (!part || !meta) return { eligible: false, isLeader: false };

  const status = typeof part.status === 'string' ? part.status : undefined;
  const phase = typeof part.phase === 'string' ? part.phase : undefined;
  const lifecycle = typeof meta.lifecycle === 'string' ? meta.lifecycle : undefined;
  const leaderId = String(meta.leaderId || meta.createdBy || '');

  const joined = !(status && EXCLUDED_STATUSES.has(status)) && phase !== 'gave_up';
  const preparing = lifecycle ? CHAT_LIFECYCLES.has(lifecycle) : false;
  const isLeader = leaderId !== '' && leaderId === userId;
  return { eligible: joined && preparing, status, lifecycle, isLeader };
}
