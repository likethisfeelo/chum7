import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, GetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

export type BlockType = 'text' | 'image' | 'link' | 'quote';

export function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

export function getUserId(event: APIGatewayProxyEvent): string | null {
  return (event.requestContext.authorizer?.jwt?.claims?.sub as string) || null;
}

export function decodeNextToken(nextToken?: string | null): Record<string, unknown> | undefined {
  if (!nextToken) return undefined;
  return JSON.parse(Buffer.from(nextToken, 'base64').toString('utf8'));
}

export function encodeNextToken(lastEvaluatedKey?: Record<string, unknown>): string | null {
  if (!lastEvaluatedKey) return null;
  return Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64');
}

export async function isParticipant(
  docClient: DynamoDBDocumentClient,
  challengeId: string,
  userId: string,
): Promise<boolean> {
  const result = await docClient.send(new QueryCommand({
    TableName: process.env.USER_CHALLENGES_TABLE!,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'challengeId = :cid AND #status = :active',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':uid': userId,
      ':cid': challengeId,
      ':active': 'active',
    },
    Limit: 1,
  }));

  return !!result.Items?.length;
}

export async function isLeader(
  docClient: DynamoDBDocumentClient,
  challengeId: string,
  userId: string,
): Promise<boolean> {
  const result = await docClient.send(new GetCommand({
    TableName: process.env.CHALLENGES_TABLE!,
    Key: { challengeId },
  }));

  if (!result.Item) return false;
  return result.Item.creatorId === userId;
}

export function validateBlocks(blocks: any[], allowQuote: boolean): { valid: boolean; message?: string } {
  if (!Array.isArray(blocks)) return { valid: false, message: 'blocks must be an array' };

  for (const block of blocks) {
    if (!block || typeof block !== 'object') return { valid: false, message: 'each block must be an object' };
    if (typeof block.id !== 'string' || !block.id.trim()) return { valid: false, message: 'block.id is required' };
    if (!['text', 'image', 'link', 'quote'].includes(block.type)) {
      return { valid: false, message: 'invalid block type' };
    }
    if (!allowQuote && block.type === 'quote') {
      return { valid: false, message: 'quote block is not supported in this document' };
    }

    if (block.type === 'text' || block.type === 'quote') {
      if (typeof block.content !== 'string' || !block.content.trim()) {
        return { valid: false, message: `${block.type}.content is required` };
      }
    }

    if (block.type === 'image') {
      if (typeof block.url !== 'string' || !/^https?:\/\//.test(block.url)) {
        return { valid: false, message: 'image.url must be a valid URL' };
      }
    }

    if (block.type === 'link') {
      if (typeof block.url !== 'string' || !/^https?:\/\//.test(block.url)) {
        return { valid: false, message: 'link.url must be a valid URL' };
      }
      if (block.label && typeof block.label !== 'string') {
        return { valid: false, message: 'link.label must be a string' };
      }
    }
  }

  return { valid: true };
}

const eventBridgeClient = new EventBridgeClient({});

export function trackKpiEvent(name: string, payload: Record<string, unknown>) {
  const eventBusName = process.env.EVENT_BUS_NAME;
  if (!eventBusName) {
    console.log(JSON.stringify({ type: 'kpi-event', mode: 'log-only', name, ...payload }));
    return;
  }

  const occurredAt = (payload.occurredAt ?? payload.at ?? new Date().toISOString()) as string;
  const actorId = (payload.actorId ?? payload.actorUserId ?? null) as string | null;
  const challengeId = (payload.challengeId ?? null) as string | null;

  const metadata = Object.fromEntries(Object.entries(payload).filter(([key]) => !['actorId', 'actorUserId', 'challengeId', 'occurredAt', 'at'].includes(key)));

  const detail = {
    eventName: name,
    eventVersion: process.env.KPI_EVENT_VERSION ?? '1',
    actorId,
    challengeId,
    occurredAt,
    metadata,
  };

  eventBridgeClient.send(new PutEventsCommand({
    Entries: [
      {
        EventBusName: eventBusName,
        Source: process.env.KPI_EVENT_SOURCE ?? 'chme.challenge-board.kpi',
        DetailType: 'ChallengeKpiEvent',
        Time: new Date(occurredAt),
        Detail: JSON.stringify(detail),
      },
    ],
  })).catch((error) => {
    console.warn('kpi event publish failed (best-effort)', {
      error,
      eventName: name,
      challengeId,
      actorId,
    });
  });
}
