import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'crypto';

type KpiEventDetail = {
  eventName?: string;
  eventVersion?: string;
  actorId?: string | null;
  challengeId?: string | null;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};

type BatchWriteRequestItem = { PutRequest?: { Item?: Record<string, unknown> } };

type EventBridgeEnvelope = {
  id?: string;
  source?: string;
  ['detail-type']?: string;
  detail?: unknown;
};

type PreparedWriteItem = {
  messageId: string;
  putRequest: { PutRequest: { Item: Record<string, unknown> } };
};

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.KPI_EVENTS_TABLE;

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function markFailure(failureIds: Set<string>, messageId: string): void {
  failureIds.add(messageId);
}



function buildDeterministicEventId(recordMessageId: string, envelope: EventBridgeEnvelope, detail: KpiEventDetail): string {
  if (typeof envelope.id === 'string' && envelope.id.trim()) {
    return envelope.id;
  }

  const digestSource = JSON.stringify({
    source: envelope.source ?? 'unknown',
    detailType: envelope['detail-type'] ?? 'unknown',
    eventName: detail.eventName ?? null,
    eventVersion: detail.eventVersion ?? '1',
    actorId: detail.actorId ?? null,
    challengeId: detail.challengeId ?? null,
    occurredAt: detail.occurredAt ?? null,
    metadata: detail.metadata ?? {},
  });

  return `kpi-${recordMessageId}-${createHash('sha256').update(digestSource).digest('hex').slice(0, 24)}`;
}

function parseDetail(rawDetail: unknown): KpiEventDetail {
  if (typeof rawDetail === 'string') {
    return JSON.parse(rawDetail) as KpiEventDetail;
  }
  if (rawDetail && typeof rawDetail === 'object') {
    return rawDetail as KpiEventDetail;
  }
  return {};
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  if (!TABLE_NAME) {
    console.error('KPI_EVENTS_TABLE is not set');
    return { batchItemFailures: event.Records.map((record) => ({ itemIdentifier: record.messageId })) };
  }

  const failureIds = new Set<string>();
  const preparedItems: PreparedWriteItem[] = [];

  for (const record of event.Records) {
    try {
      const envelope = JSON.parse(record.body) as EventBridgeEnvelope;
      const detail = parseDetail(envelope.detail);

      const eventName = detail.eventName;
      const occurredAt = detail.occurredAt;

      if (!eventName || !occurredAt) {
        throw new Error('Invalid KPI event payload: eventName/occurredAt missing');
      }

      preparedItems.push({
        messageId: record.messageId,
        putRequest: {
          PutRequest: {
            Item: {
              eventId: buildDeterministicEventId(record.messageId, envelope, detail),
              eventName,
              eventVersion: detail.eventVersion ?? '1',
              actorId: detail.actorId ?? null,
              challengeId: detail.challengeId ?? null,
              occurredAt,
              metadata: detail.metadata ?? {},
              source: envelope.source ?? 'unknown',
              detailType: envelope['detail-type'] ?? 'unknown',
              ingestedAt: new Date().toISOString(),
            },
          },
        },
      });
    } catch (error) {
      console.error('failed to parse/process KPI event record', { messageId: record.messageId, error });
      markFailure(failureIds, record.messageId);
    }
  }

  for (const batch of chunk(preparedItems, 25)) {
    try {
      const requestItems = batch.map((item) => item.putRequest);
      const result = await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: requestItems,
        },
      }));

      const unprocessed = (result.UnprocessedItems?.[TABLE_NAME] ?? []) as BatchWriteRequestItem[];
      if (unprocessed.length > 0) {
        const unprocessedEventIds = new Set(
          unprocessed
            .map((item: BatchWriteRequestItem) => item.PutRequest?.Item?.eventId)
            .filter((id: unknown): id is string => typeof id === 'string'),
        );

        for (const batchItem of batch) {
          const eventId = batchItem.putRequest.PutRequest.Item.eventId;
          if (typeof eventId === 'string' && unprocessedEventIds.has(eventId)) {
            markFailure(failureIds, batchItem.messageId);
          }
        }
      }
    } catch (error) {
      console.error('failed to write KPI events batch', { error });
      for (const batchItem of batch) {
        markFailure(failureIds, batchItem.messageId);
      }
    }
  }

  return {
    batchItemFailures: Array.from(failureIds).map((messageId) => ({ itemIdentifier: messageId })),
  };
};
