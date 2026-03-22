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

type MaterializerEvent = {
  fromIso?: string;
  toIso?: string;
  dryRun?: boolean;
  maxRetries?: number;
  totalSegments?: number;
  segmentIndex?: number;
  maxScanPages?: number;
  scanPageSize?: number;
};

type ScanOptions = {
  totalSegments?: number;
  segment?: number;
  maxScanPages?: number;
  scanPageSize?: number;
};

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_SCAN_PAGE_SIZE = 500;
const MAX_SCAN_PAGE_SIZE = 1000;

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

function resolveEventRange(event: MaterializerEvent | undefined): { fromIso?: string; toIso?: string } {
  const fromIso = event?.fromIso;
  const toIso = event?.toIso;

  const fromValid = fromIso && !Number.isNaN(new Date(fromIso).getTime()) ? fromIso : undefined;
  const toValid = toIso && !Number.isNaN(new Date(toIso).getTime()) ? toIso : undefined;

  return {
    fromIso: fromValid,
    toIso: toValid
  };
}

function isInEventRange(cheer: CheerItem, fromIso?: string, toIso?: string): boolean {
  const ts = resolveTimestamp(cheer);
  if (!ts) return false;
  if (fromIso && ts < fromIso) return false;
  if (toIso && ts > toIso) return false;
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveMaxRetries(event: MaterializerEvent | undefined): number {
  const envMax = Number(process.env.CHEER_STATS_MATERIALIZER_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
  const eventMax = Number(event?.maxRetries);
  const candidate = Number.isFinite(eventMax) && eventMax > 0 ? eventMax : envMax;

  if (!Number.isFinite(candidate) || candidate <= 0) {
    return DEFAULT_MAX_RETRIES;
  }

  return Math.floor(candidate);
}

function resolveScanOptions(event: MaterializerEvent | undefined): ScanOptions {
  const parsedTotalSegments = Number(event?.totalSegments);
  const parsedSegmentIndex = Number(event?.segmentIndex);
  const parsedMaxScanPages = Number(event?.maxScanPages);
  const parsedScanPageSize = Number(event?.scanPageSize);

  const hasValidSegmentation =
    Number.isFinite(parsedTotalSegments)
    && Number.isFinite(parsedSegmentIndex)
    && parsedTotalSegments > 0
    && parsedSegmentIndex >= 0
    && parsedSegmentIndex < parsedTotalSegments;

  const totalSegments = hasValidSegmentation ? Math.floor(parsedTotalSegments) : undefined;
  const segment = hasValidSegmentation ? Math.floor(parsedSegmentIndex) : undefined;

  const maxScanPages = Number.isFinite(parsedMaxScanPages) && parsedMaxScanPages > 0
    ? Math.floor(parsedMaxScanPages)
    : undefined;

  const scanPageSize = Number.isFinite(parsedScanPageSize) && parsedScanPageSize > 0
    ? Math.min(MAX_SCAN_PAGE_SIZE, Math.floor(parsedScanPageSize))
    : DEFAULT_SCAN_PAGE_SIZE;

  return {
    totalSegments,
    segment,
    maxScanPages,
    scanPageSize
  };
}

async function scanAllCheers(options: ScanOptions): Promise<{ items: CheerItem[]; scannedPages: number; truncated: boolean }> {
  const items: CheerItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let scannedPages = 0;

  do {
    if (options.maxScanPages && scannedPages >= options.maxScanPages) {
      return {
        items,
        scannedPages,
        truncated: true
      };
    }

    const page = await docClient.send(new ScanCommand({
      TableName: process.env.CHEERS_TABLE!,
      ExclusiveStartKey: lastEvaluatedKey,
      Segment: options.segment,
      TotalSegments: options.totalSegments,
      Limit: options.scanPageSize
    }));

    scannedPages += 1;
    items.push(...((page.Items || []) as CheerItem[]));
    lastEvaluatedKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return {
    items,
    scannedPages,
    truncated: false
  };
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

async function writeChunkWithRetry(tableName: string, chunk: Array<Record<string, unknown>>, maxRetries: number): Promise<number> {
  let unprocessed = chunk.map((item) => ({ PutRequest: { Item: item } }));
  let attempt = 0;

  while (unprocessed.length > 0 && attempt <= maxRetries) {
    const result = await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: unprocessed
      }
    }));

    const nextUnprocessed = result.UnprocessedItems?.[tableName] || [];
    if (nextUnprocessed.length === 0) {
      return 0;
    }

    unprocessed = nextUnprocessed.map((entry: any) => ({ PutRequest: entry.PutRequest }));
    attempt += 1;

    console.warn('Cheer stats materializer retrying unprocessed items', {
      tableName,
      attempt,
      remaining: unprocessed.length
    });

    await sleep(Math.min(1000, attempt * 200));
  }

  return unprocessed.length;
}

async function batchWriteStats(items: Array<Record<string, unknown>>, maxRetries: number): Promise<{ requested: number; failed: number }> {
  const tableName = process.env.CHEER_STATS_TABLE;
  if (!tableName) {
    throw new Error('CHEER_STATS_TABLE is required');
  }

  let failed = 0;
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    failed += await writeChunkWithRetry(tableName, chunk, maxRetries);
  }

  return {
    requested: items.length,
    failed
  };
}

export const handler = async (event?: MaterializerEvent): Promise<{ success: boolean; scanned: number; filtered: number; written: number; failed: number; dryRun: boolean; scannedPages: number; truncated: boolean }> => {
  const startedAt = Date.now();

  console.info('Cheer stats materializer started', { event: event || {} });

  const { fromIso, toIso } = resolveEventRange(event);
  const dryRun = Boolean(event?.dryRun);
  const maxRetries = resolveMaxRetries(event);
  const scanOptions = resolveScanOptions(event);

  const scanResult = await scanAllCheers(scanOptions);
  const filteredCheers = scanResult.items.filter((item) => isInEventRange(item, fromIso, toIso));
  const docs = buildStatsDocuments(filteredCheers);

  let failed = 0;
  if (!dryRun) {
    const writeResult = await batchWriteStats(docs, maxRetries);
    failed = writeResult.failed;
  }

  const latencyMs = Date.now() - startedAt;
  console.info('Cheer stats materializer finished', {
    scanned: scanResult.items.length,
    scannedPages: scanResult.scannedPages,
    truncated: scanResult.truncated,
    filtered: filteredCheers.length,
    written: docs.length,
    failed,
    dryRun,
    fromIso: fromIso ?? null,
    toIso: toIso ?? null,
    maxRetries,
    totalSegments: scanOptions.totalSegments ?? null,
    segment: scanOptions.segment ?? null,
    maxScanPages: scanOptions.maxScanPages ?? null,
    scanPageSize: scanOptions.scanPageSize ?? null,
    latencyMs
  });

  return {
    success: failed === 0,
    scanned: scanResult.items.length,
    scannedPages: scanResult.scannedPages,
    truncated: scanResult.truncated,
    filtered: filteredCheers.length,
    written: docs.length,
    failed,
    dryRun
  };
};
