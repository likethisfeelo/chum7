import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb';

type CheerItem = {
  senderId?: string;
  receiverId?: string;
  challengeId?: string;
  cheerType?: string;
  isThanked?: boolean;
  replyMessage?: string | null;
  reactionType?: string | null;
  createdAt?: string;
  sentAt?: string;
};

type StatsRecord = {
  sentCount: number;
  receivedCount: number;
  thankedCount: number;
  immediateCount: number;
  scheduledCount: number;
  repliedCount: number;
  reactionCount: number;
};

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function createEmptyStats(): StatsRecord {
  return {
    sentCount: 0,
    receivedCount: 0,
    thankedCount: 0,
    immediateCount: 0,
    scheduledCount: 0,
    repliedCount: 0,
    reactionCount: 0
  };
}

function resolveTimestamp(item: CheerItem): string {
  return item.sentAt || item.createdAt || '';
}

function toDayLabel(iso: string): string {
  return iso.slice(0, 10);
}

function toMonthLabel(iso: string): string {
  return iso.slice(0, 7);
}

function toWeekLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return 'unknown';
  }

  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function increment(stats: StatsRecord, cheer: CheerItem, isSenderPerspective: boolean): void {
  if (isSenderPerspective) {
    stats.sentCount += 1;
  } else {
    stats.receivedCount += 1;
  }

  if (cheer.isThanked) {
    stats.thankedCount += 1;
  }

  if (cheer.cheerType === 'immediate') {
    stats.immediateCount += 1;
  }

  if (cheer.cheerType === 'scheduled') {
    stats.scheduledCount += 1;
  }

  if (cheer.replyMessage) {
    stats.repliedCount += 1;
  }

  if (cheer.reactionType) {
    stats.reactionCount += 1;
  }
}

function ensureMapEntry(map: Map<string, StatsRecord>, key: string): StatsRecord {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const created = createEmptyStats();
  map.set(key, created);
  return created;
}

async function scanAllCheers(): Promise<CheerItem[]> {
  const items: CheerItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: process.env.CHEERS_TABLE!,
      ExclusiveStartKey: lastEvaluatedKey
    }));

    items.push(...((page.Items || []) as CheerItem[]));
    lastEvaluatedKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return items;
}

function buildStatsDocuments(cheers: CheerItem[]): Array<Record<string, unknown>> {
  const statsMap = new Map<string, StatsRecord>();

  for (const cheer of cheers) {
    const senderId = cheer.senderId;
    const receiverId = cheer.receiverId;
    const ts = resolveTimestamp(cheer);

    if (!ts || (!senderId && !receiverId)) {
      continue;
    }

    const day = toDayLabel(ts);
    const week = toWeekLabel(ts);
    const month = toMonthLabel(ts);
    const challengeId = cheer.challengeId?.trim();

    const keySpecs: Array<{ ownerId?: string; sk: string; senderPerspective: boolean }> = [];

    if (senderId) {
      keySpecs.push({ ownerId: senderId, sk: 'all#summary', senderPerspective: true });
      keySpecs.push({ ownerId: senderId, sk: `day#${day}`, senderPerspective: true });
      keySpecs.push({ ownerId: senderId, sk: `week#${week}`, senderPerspective: true });
      keySpecs.push({ ownerId: senderId, sk: `month#${month}`, senderPerspective: true });
      if (challengeId) {
        keySpecs.push({ ownerId: senderId, sk: `challenge#${challengeId}#all`, senderPerspective: true });
      }
    }

    if (receiverId) {
      keySpecs.push({ ownerId: receiverId, sk: 'all#summary', senderPerspective: false });
      keySpecs.push({ ownerId: receiverId, sk: `day#${day}`, senderPerspective: false });
      keySpecs.push({ ownerId: receiverId, sk: `week#${week}`, senderPerspective: false });
      keySpecs.push({ ownerId: receiverId, sk: `month#${month}`, senderPerspective: false });
      if (challengeId) {
        keySpecs.push({ ownerId: receiverId, sk: `challenge#${challengeId}#all`, senderPerspective: false });
      }
    }

    for (const spec of keySpecs) {
      if (!spec.ownerId) {
        continue;
      }

      const key = `owner#${spec.ownerId}|${spec.sk}`;
      const stats = ensureMapEntry(statsMap, key);
      increment(stats, cheer, spec.senderPerspective);
    }
  }

  const now = new Date().toISOString();
  return Array.from(statsMap.entries()).map(([key, stats]) => {
    const [pk, sk] = key.split('|');
    return {
      PK: pk,
      SK: sk,
      ...stats,
      updatedAt: now
    };
  });
}

async function batchWriteStats(items: Array<Record<string, unknown>>): Promise<void> {
  const tableName = process.env.CHEER_STATS_TABLE;
  if (!tableName) {
    throw new Error('CHEER_STATS_TABLE is required');
  }

  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk.map((item) => ({
          PutRequest: { Item: item }
        }))
      }
    }));
  }
}

export const handler = async (): Promise<{ success: boolean; scanned: number; written: number }> => {
  const startedAt = Date.now();

  console.info('Cheer stats materializer started');

  const cheers = await scanAllCheers();
  const docs = buildStatsDocuments(cheers);

  await batchWriteStats(docs);

  const latencyMs = Date.now() - startedAt;
  console.info('Cheer stats materializer finished', {
    scanned: cheers.length,
    written: docs.length,
    latencyMs
  });

  return {
    success: true,
    scanned: cheers.length,
    written: docs.length
  };
};
