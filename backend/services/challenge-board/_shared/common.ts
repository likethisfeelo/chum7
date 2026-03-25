import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, GetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'crypto';

export type BlockType = 'text' | 'image' | 'link' | 'quote' | 'rich-text' | 'video';

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
  }));

  return !!result.Items?.length;
}

// 현재 활성 참여자 및 완료/실패한 전 참여자 포함 (챌린지 완료 후 읽기 접근용)
export async function wasParticipant(
  docClient: DynamoDBDocumentClient,
  challengeId: string,
  userId: string,
): Promise<boolean> {
  const result = await docClient.send(new QueryCommand({
    TableName: process.env.USER_CHALLENGES_TABLE!,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'challengeId = :cid AND #status IN (:active, :completed, :failed)',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':uid': userId,
      ':cid': challengeId,
      ':active': 'active',
      ':completed': 'completed',
      ':failed': 'failed',
    },
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
  return result.Item.creatorId === userId || result.Item.createdBy === userId;
}

const ANIMAL_DICTIONARY = [
  '고래', '수달', '여우', '참새', '돌고래', '해달', '호랑이', '판다',
  '늑대', '펭귄', '매', '고양이', '강아지', '알파카', '사슴', '기린',
];

function toKstDateKey(date = new Date()): string {
  const kstText = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return kstText;
}

export function createDailyAnonymousId(challengeId: string, userId: string, date = new Date()): string {
  const salt = process.env.ANON_ID_SALT;
  if (!salt) throw new Error('ANON_SALT_NOT_CONFIGURED');

  const dateKey = toKstDateKey(date);
  const source = `${challengeId}:${userId}:${dateKey}:${salt}`;
  const seed = createHash('sha256').update(source).digest('hex');

  const animalIndex = parseInt(seed.slice(0, 8), 16) % ANIMAL_DICTIONARY.length;
  const number = (parseInt(seed.slice(8, 16), 16) % 900) + 100;

  return `${ANIMAL_DICTIONARY[animalIndex]}-${number}`;
}

export function validateBlocks(blocks: any[], allowQuote: boolean): { valid: boolean; message?: string } {
  if (!Array.isArray(blocks)) return { valid: false, message: 'blocks must be an array' };

  for (const block of blocks) {
    if (!block || typeof block !== 'object') return { valid: false, message: 'each block must be an object' };
    if (typeof block.id !== 'string' || !block.id.trim()) return { valid: false, message: 'block.id is required' };
    if (!['text', 'image', 'link', 'quote', 'rich-text', 'video'].includes(block.type)) {
      return { valid: false, message: 'invalid block type' };
    }
    if (!allowQuote && block.type === 'quote') {
      return { valid: false, message: 'quote block is not supported in this document' };
    }

    if (block.type === 'rich-text') {
      if (!block.content || typeof block.content !== 'object') {
        return { valid: false, message: 'rich-text.content must be a TipTap JSON object' };
      }
    }

    if (block.type === 'video') {
      if (typeof block.url !== 'string' || !/^https?:\/\//.test(block.url)) {
        return { valid: false, message: 'video.url must be a valid URL' };
      }
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

  const videoCount = blocks.filter((b) => b.type === 'video').length;
  if (videoCount > 10) {
    return { valid: false, message: '동영상은 최대 10개까지 추가할 수 있습니다' };
  }

  return { valid: true };
}

export function trackKpiEvent(name: string, payload: Record<string, unknown>) {
  // 확장 포인트: EventBridge/Kinesis/Analytics SDK로 대체 가능
  console.log(JSON.stringify({ type: 'kpi-event', name, ...payload }));
}
