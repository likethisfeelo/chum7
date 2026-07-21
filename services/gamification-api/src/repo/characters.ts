import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import type { CharacterRecord, CharacterSlot } from '../domain/character-slot';

/**
 * gamification 테이블 — 캐릭터/신화 진행 (키 설계: 이전 가이드 §3 gamification).
 *  - 사용자 캐릭터 상태: pk=`USER#<userId>`, sk=`CHARACTER`
 *    (레거시 USERS_TABLE의 activeMythology/activeCharacterId/onboardingDone/
 *     themeOverride/completedMythologies/pendingSlotFills 필드 이전)
 *  - 캐릭터 인스턴스:   pk=`USER#<userId>`, sk=`CHAR#<characterId>`
 *    (레거시 CHARACTERS_TABLE 아이템 이전 — "내 캐릭터" = pk Query + begins_with(sk, 'CHAR#'))
 */
const TABLE = 'GAMIFICATION_TABLE';
const SK_STATE = 'CHARACTER';

const pkOf = (userId: string) => `USER#${userId}`;
const skOf = (characterId: string) => `CHAR#${characterId}`;

/** 레거시 users 테이블 캐릭터 관련 필드의 이전 형태 */
export interface CharacterState {
  activeMythology?: string | null;
  activeCharacterId?: string | null;
  onboardingDone?: boolean;
  themeOverride?: string | null;
  completedMythologies?: string[];
  pendingSlotFills?: number;
  updatedAt?: string;
}

export async function getCharacterState(userId: string): Promise<CharacterState | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: pkOf(userId), sk: SK_STATE },
    }),
  );
  return res.Item as CharacterState | undefined;
}

/** 상태 아이템 부분 갱신 (없으면 생성 — 레거시 users UpdateCommand 대응) */
export async function updateCharacterState(
  userId: string,
  attrs: Record<string, unknown>,
): Promise<void> {
  const { expression, names, values } = buildSetExpression(attrs);
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: pkOf(userId), sk: SK_STATE },
      UpdateExpression: expression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export async function getCharacter(
  userId: string,
  characterId: string,
): Promise<CharacterRecord | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: pkOf(userId), sk: skOf(characterId) },
    }),
  );
  return res.Item as CharacterRecord | undefined;
}

/** 내 캐릭터 전체 (레거시 userId-index Query 대응 — pk + begins_with CHAR#) */
export async function listCharacters(userId: string): Promise<CharacterRecord[]> {
  const items: CharacterRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: { ':pk': pkOf(userId), ':sk': 'CHAR#' },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...((res.Items ?? []) as CharacterRecord[]));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** 새 캐릭터 생성 (레거시 ConditionExpression attribute_not_exists(characterId) 대응) */
export async function createCharacter(record: CharacterRecord): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: { pk: pkOf(record.userId), sk: skOf(record.characterId), ...record },
      ConditionExpression: 'attribute_not_exists(sk)',
    }),
  );
}

/** 캐릭터 슬롯/상태 갱신 (pendingSlotFills 소급 반영 등) */
export async function updateCharacterProgress(
  userId: string,
  characterId: string,
  update: {
    slots: CharacterSlot[];
    filledCount: number;
    status?: 'complete';
    completedAt?: string;
  },
): Promise<void> {
  const attrs: Record<string, unknown> = {
    slots: update.slots,
    filledCount: update.filledCount,
  };
  if (update.status) attrs.status = update.status;
  if (update.completedAt) attrs.completedAt = update.completedAt;
  const { expression, names, values } = buildSetExpression(attrs);
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: pkOf(userId), sk: skOf(characterId) },
      UpdateExpression: expression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

/** SET 표현식 빌더 — 예약어(status 등) 충돌 방지 위해 전 속성 alias 처리 */
function buildSetExpression(attrs: Record<string, unknown>): {
  expression: string;
  names: Record<string, string>;
  values: Record<string, unknown>;
} {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets = Object.entries(attrs).map(([key, value], i) => {
    names[`#a${i}`] = key;
    values[`:v${i}`] = value;
    return `#a${i} = :v${i}`;
  });
  return { expression: `SET ${sets.join(', ')}`, names, values };
}
