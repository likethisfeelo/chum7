/**
 * 라이브 방 입장 자격 + 방 조회 — challenges 테이블 읽기 전용(문서화된 크로스 도메인 예외).
 * 방 아이템: pk=`CHAL#<challengeId>`, sk=`LIVE#<roomId>` (challenge-api routes/live.ts가 소유).
 * 입장 가능: 챌린지 참여자(중도포기/실패/거절 제외) 또는 리더·매니저.
 * 단체 채팅과 달리 lifecycle 제한 없음 — 진행 중 챌린지에서도 방을 열 수 있다.
 */
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '@chum7/api-kit';

const EXCLUDED_STATUSES = new Set(['gave_up', 'failed', 'rejected']);

/** challenge-api domain/live-rules.ts와 동일 상수 — 좀비 방 종료 취급 기준 */
const LIVE_ROOM_MAX_AGE_HOURS = 12;
export const LIVE_ROOM_MAX_PARTICIPANTS = 10;
export const LIVE_ROOM_MAX_SPEAKERS = 6;

export interface LiveRoomMeta {
  roomId: string;
  challengeId: string;
  mode: string;
  recording: boolean;
  hostUserId: string;
  title: string | null;
}

export interface LiveEligibility {
  eligible: boolean;
  isLeader: boolean;
  isHost: boolean;
  room?: LiveRoomMeta;
}

export async function getLiveEligibility(
  challengeId: string,
  roomId: string,
  userId: string,
): Promise<LiveEligibility> {
  const table = process.env.CHALLENGES_TABLE;
  if (!table) throw new Error('Missing table env: CHALLENGES_TABLE');

  const [roomRes, metaRes, partRes] = await Promise.all([
    docClient.send(
      new GetCommand({
        TableName: table,
        Key: { pk: `CHAL#${challengeId}`, sk: `LIVE#${roomId}` },
      }),
    ),
    docClient.send(
      new GetCommand({
        TableName: table,
        Key: { pk: `CHAL#${challengeId}`, sk: 'META' },
        ProjectionExpression: 'leaderId, createdBy, managerIds',
      }),
    ),
    docClient.send(
      new GetCommand({
        TableName: table,
        Key: { pk: `CHAL#${challengeId}`, sk: `UC#${userId}` },
        ProjectionExpression: '#s, phase',
        ExpressionAttributeNames: { '#s': 'status' },
      }),
    ),
  ]);

  const roomItem = roomRes.Item;
  const meta = metaRes.Item;
  if (!roomItem || !meta) return { eligible: false, isLeader: false, isHost: false };

  // 진행 중인 방만 입장 — 좀비(live지만 만료) 포함 차단
  const started = Date.parse(String(roomItem.startedAt ?? ''));
  const activeWindow = Number.isFinite(started)
    ? Date.now() - started <= LIVE_ROOM_MAX_AGE_HOURS * 60 * 60 * 1000
    : false;
  if (roomItem.status !== 'live' || !activeWindow) {
    return { eligible: false, isLeader: false, isHost: false };
  }

  const leaderId = String(meta.leaderId || meta.createdBy || '');
  const managerIds: string[] = Array.isArray(meta.managerIds) ? meta.managerIds.map(String) : [];
  const isLeader = (leaderId !== '' && leaderId === userId) || managerIds.includes(userId);
  const isHost = String(roomItem.hostUserId) === userId;

  let eligible = isLeader || isHost;
  if (!eligible) {
    const part = partRes.Item;
    eligible = Boolean(
      part &&
        !(typeof part.status === 'string' && EXCLUDED_STATUSES.has(part.status)) &&
        part.phase !== 'gave_up',
    );
  }

  return {
    eligible,
    isLeader,
    isHost,
    room: {
      roomId: String(roomItem.roomId),
      challengeId,
      mode: String(roomItem.mode || 'audio'),
      recording: roomItem.recording === true,
      hostUserId: String(roomItem.hostUserId),
      title: typeof roomItem.title === 'string' ? roomItem.title : null,
    },
  };
}
