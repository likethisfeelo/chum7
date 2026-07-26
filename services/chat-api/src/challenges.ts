import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '@chum7/api-kit';

/**
 * 참여자 검증 — challenges 테이블 단일키 조회(읽기 전용, 문서화된 크로스 도메인 예외).
 *  pk=`CHAL#<challengeId>`, sk=`UC#<userId>` (repo/participations.ts 와 동일 키).
 * 채팅 입장 자격: status 가 active(진행중) 또는 completed(완료) 인 참여자만.
 * pending(승인대기)·gave_up·failed·rejected 는 입장 불가.
 */
const CHAT_ELIGIBLE_STATUSES = new Set(['active', 'completed']);

export async function getChatEligibility(
  challengeId: string,
  userId: string,
): Promise<{ eligible: boolean; status?: string }> {
  const table = process.env.CHALLENGES_TABLE;
  if (!table) throw new Error('Missing table env: CHALLENGES_TABLE');
  const res = await docClient.send(
    new GetCommand({
      TableName: table,
      Key: { pk: `CHAL#${challengeId}`, sk: `UC#${userId}` },
      ProjectionExpression: '#s, phase',
      ExpressionAttributeNames: { '#s': 'status' },
    }),
  );
  const item = res.Item;
  if (!item) return { eligible: false };
  const status = typeof item.status === 'string' ? item.status : undefined;
  // phase 로도 active 를 판정(status 미기록 레거시 대비)
  const active = status ? CHAT_ELIGIBLE_STATUSES.has(status) : item.phase === 'active';
  return { eligible: active, status };
}
