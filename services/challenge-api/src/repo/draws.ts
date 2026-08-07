/**
 * challenges 테이블 — 완주자 랜덤 추첨 이력.
 *  pk=`CHAL#<challengeId>`, sk=`DRAW#<createdAt>#<drawId>` (최신순 Query 용이)
 * 추첨은 서버에서 crypto 난수로 실행하고 결과를 그대로 기록한다(조작 시비 방지 감사 로그).
 */
import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE, challengePk, stripKeys } from './shared';

export interface DrawWinner {
  userId: string;
  userChallengeId: string | null;
  personalGoal: string | null;
  completedDays: number;
  score: number;
}

export interface DrawRecord {
  drawId: string;
  challengeId: string;
  title: string | null;
  winnerCount: number;
  eligibleCount: number;
  excludePreviousWinners: boolean;
  winners: DrawWinner[];
  executedBy: string;
  executedByRole: 'leader' | 'manager';
  createdAt: string;
}

export async function putDraw(record: DrawRecord): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: challengePk(record.challengeId),
        sk: `DRAW#${record.createdAt}#${record.drawId}`,
        ...record,
      },
    }),
  );
}

/** 추첨 이력 전체 — 최신순 */
export async function listDraws(challengeId: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: { ':pk': challengePk(challengeId), ':sk': 'DRAW#' },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** drawId로 삭제 — 이력에서 키를 찾아 제거. 없으면 false */
export async function deleteDrawById(challengeId: string, drawId: string): Promise<boolean> {
  const draws = await listDraws(challengeId);
  const target = draws.find((d) => String(d.drawId) === drawId);
  if (!target) return false;
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: String(target.pk), sk: String(target.sk) },
    }),
  );
  return true;
}

export const drawToResponse = (d: Record<string, any>) => stripKeys(d);
