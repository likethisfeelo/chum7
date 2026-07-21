import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

/**
 * graph 테이블 — 초대 링크 (이전 가이드 §3 graph).
 *  pk=`INVITE#<token>`, sk=`META` (ttl: expiresAtTimestamp)
 *  gsi2pk=`INVITEOWNER#<userId>`, gsi2sk=`<createdAt>`
 */
const TABLE = 'GRAPH_TABLE';
const SK_META = 'META';

export interface InviteLinkRecord extends Record<string, unknown> {
  inviteLinkId: string;
  ownerId: string;
  token: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  expiresAtTimestamp?: number;
  createdAt: string;
}

export async function createInviteLink(record: InviteLinkRecord): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: `INVITE#${record.token}`,
        sk: SK_META,
        gsi2pk: `INVITEOWNER#${record.ownerId}`,
        gsi2sk: record.createdAt,
        ...record,
      },
    }),
  );
}

export async function getInviteLinkByToken(token: string): Promise<InviteLinkRecord | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: `INVITE#${token}`, sk: SK_META } }),
  );
  return res.Item as InviteLinkRecord | undefined;
}

export async function incrementInviteUse(token: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: `INVITE#${token}`, sk: SK_META },
      UpdateExpression: 'SET usedCount = usedCount + :one',
      ExpressionAttributeValues: { ':one': 1 },
    }),
  );
}

/** 소유자의 링크 목록 (gsi2, 최신순) */
export async function listInviteLinks(ownerId: string): Promise<InviteLinkRecord[]> {
  const items: InviteLinkRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :owner',
        ExpressionAttributeValues: { ':owner': `INVITEOWNER#${ownerId}` },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...((res.Items ?? []) as InviteLinkRecord[]));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

export async function deleteInviteLinkByToken(token: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: `INVITE#${token}`, sk: SK_META },
    }),
  );
}
