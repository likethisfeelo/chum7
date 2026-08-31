/**
 * challenges 테이블 — 라이브 방(음성/방송) + 동의 기록.
 *  방      pk=`CHAL#<challengeId>` sk=`LIVE#<roomId>`
 *  동의    pk=`CHAL#<challengeId>` sk=`LIVECONSENT#<roomId>#<userId>`
 * recording(저장 여부)은 개설 시 확정·불변. 오프더레코드 방은 미디어·채팅을 일절
 * 저장하지 않으므로 여기엔 방 메타와 동의 기록만 남는다.
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE, challengePk } from './shared';

const liveSk = (roomId: string) => `LIVE#${roomId}`;
const consentSk = (roomId: string, userId: string) => `LIVECONSENT#${roomId}#${userId}`;

export interface LiveRoomItem {
  pk: string;
  sk: string;
  roomId: string;
  challengeId: string;
  mode: 'audio' | 'video';
  recording: boolean;
  status: 'live' | 'ended';
  hostUserId: string;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  recordingKeys: string[];
  createdAt: string;
}

export async function putLiveRoom(item: LiveRoomItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: item,
      ConditionExpression: 'attribute_not_exists(sk)',
    }),
  );
}

export async function getLiveRoom(
  challengeId: string,
  roomId: string,
): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: liveSk(roomId) },
    }),
  );
  return res.Item;
}

/** 챌린지의 방 이력 전체 — 운영탭 녹음 다운로드 목록용 (최신 startedAt 순 정렬은 호출부) */
export async function listAllLiveRooms(challengeId: string): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :live)',
      ExpressionAttributeValues: { ':pk': challengePk(challengeId), ':live': 'LIVE#' },
    }),
  );
  return res.Items ?? [];
}

/** 챌린지의 status='live' 방 전체 (판정은 호출부에서 isRoomActive로 — 좀비 방 제외) */
export async function listLiveStatusRooms(challengeId: string): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :live)',
      FilterExpression: '#st = :live_status',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':pk': challengePk(challengeId), ':live': 'LIVE#', ':live_status': 'live' },
    }),
  );
  return res.Items ?? [];
}

export async function endLiveRoom(challengeId: string, roomId: string, endedAt: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: liveSk(roomId) },
      UpdateExpression: 'SET #st = :ended, endedAt = :at',
      ConditionExpression: 'attribute_exists(sk)',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':ended': 'ended', ':at': endedAt },
    }),
  );
}

/** 녹음 파일 키 추가 — 개설자 이탈로 파일이 쪼개질 수 있어 리스트로 보관 */
export async function addRecordingKey(challengeId: string, roomId: string, key: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: liveSk(roomId) },
      UpdateExpression: 'SET recordingKeys = list_append(if_not_exists(recordingKeys, :empty), :k)',
      ConditionExpression: 'attribute_exists(sk)',
      ExpressionAttributeValues: { ':empty': [], ':k': [key] },
    }),
  );
}

export async function clearRecordingKeys(challengeId: string, roomId: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: liveSk(roomId) },
      UpdateExpression: 'SET recordingKeys = :empty, recordingDeletedAt = :now',
      ConditionExpression: 'attribute_exists(sk)',
      ExpressionAttributeValues: { ':empty': [], ':now': new Date().toISOString() },
    }),
  );
}

/** 동의/경고확인 기록 — 분쟁 시 "고지를 확인했다"는 근거 (덮어쓰기 허용) */
export async function putLiveConsent(input: {
  challengeId: string;
  roomId: string;
  userId: string;
  kind: 'record_consent' | 'offrecord_ack';
}): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: challengePk(input.challengeId),
        sk: consentSk(input.roomId, input.userId),
        challengeId: input.challengeId,
        roomId: input.roomId,
        userId: input.userId,
        kind: input.kind,
        createdAt: new Date().toISOString(),
      },
    }),
  );
}

export async function getLiveConsent(
  challengeId: string,
  roomId: string,
  userId: string,
): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: consentSk(roomId, userId) },
    }),
  );
  return res.Item;
}

/** 방 삭제 — 사용하지 않음(이력 보존). 어드민 정리용으로만 노출. */
export async function deleteLiveRoom(challengeId: string, roomId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: liveSk(roomId) },
    }),
  );
}
