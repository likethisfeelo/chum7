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

/**
 * 리더 DM 입장 자격 — 방은 (challengeId, participantId) 1:1.
 * 입장 가능: ① 챌린지 리더  ② 그 참여자 본인(=participantId)이며 유효 참여자.
 * (그룹 채팅과 달리 lifecycle 제한 없음 — 언제든 대화 가능)
 */
export async function getDmEligibility(
  challengeId: string,
  userId: string,
  participantId: string,
): Promise<{ eligible: boolean; isLeader: boolean }> {
  const table = process.env.CHALLENGES_TABLE;
  if (!table) throw new Error('Missing table env: CHALLENGES_TABLE');

  const metaRes = await docClient.send(
    new GetCommand({
      TableName: table,
      Key: { pk: `CHAL#${challengeId}`, sk: 'META' },
      ProjectionExpression: 'leaderId, createdBy',
    }),
  );
  const meta = metaRes.Item;
  if (!meta) return { eligible: false, isLeader: false };
  const leaderId = String(meta.leaderId || meta.createdBy || '');
  const isLeader = leaderId !== '' && leaderId === userId;

  if (isLeader) return { eligible: true, isLeader: true };

  // 참여자 측: 본인만 자기 DM 방에 입장 가능
  if (!participantId || userId !== participantId) return { eligible: false, isLeader: false };
  const partRes = await docClient.send(
    new GetCommand({
      TableName: table,
      Key: { pk: `CHAL#${challengeId}`, sk: `UC#${userId}` },
      ProjectionExpression: '#s, phase',
      ExpressionAttributeNames: { '#s': 'status' },
    }),
  );
  const part = partRes.Item;
  if (!part) return { eligible: false, isLeader: false };
  const status = typeof part.status === 'string' ? part.status : undefined;
  const joined = !(status && EXCLUDED_STATUSES.has(status)) && part.phase !== 'gave_up';
  return { eligible: joined, isLeader: false };
}
