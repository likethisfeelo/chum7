import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, GetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'crypto';

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

/** 현재 활성 참여자 (active 상태만) */
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
    ExpressionAttributeValues: { ':uid': userId, ':cid': challengeId, ':active': 'active' },
  }));
  return !!result.Items?.length;
}

/** 현재 또는 과거 참여자 (active/completed/failed) — 종료 후 읽기 허용 */
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
      ':uid': userId, ':cid': challengeId,
      ':active': 'active', ':completed': 'completed', ':failed': 'failed',
    },
  }));
  return !!result.Items?.length;
}

/** 챌린지의 lifecycle + leaderId 반환 */
export async function getChallengeMeta(
  docClient: DynamoDBDocumentClient,
  challengeId: string,
): Promise<{ lifecycle: string; leaderId: string | null } | null> {
  const result = await docClient.send(new GetCommand({
    TableName: process.env.CHALLENGES_TABLE!,
    Key: { challengeId },
    ProjectionExpression: 'lifecycle, leaderId, creatorId',
  }));
  if (!result.Item) return null;
  return {
    lifecycle: result.Item.lifecycle ?? 'unknown',
    leaderId: result.Item.leaderId || result.Item.creatorId || null,
  };
}

const ANIMAL_DICTIONARY = [
  '고래', '수달', '여우', '참새', '돌고래', '해달', '호랑이', '판다',
  '늑대', '펭귄', '매', '고양이', '강아지', '알파카', '사슴', '기린',
];

/** 챌린지 종료 후 안정적 익명 ID (날짜 무관, challengeId+userId 기반) */
export function createPersistentAnonymousId(challengeId: string, userId: string): string {
  const salt = process.env.ANON_ID_SALT;
  if (!salt) throw new Error('ANON_SALT_NOT_CONFIGURED');
  const source = `${challengeId}:${userId}:persistent:${salt}`;
  const seed = createHash('sha256').update(source).digest('hex');
  const animalIndex = parseInt(seed.slice(0, 8), 16) % ANIMAL_DICTIONARY.length;
  const number = (parseInt(seed.slice(8, 16), 16) % 900) + 100;
  return `${ANIMAL_DICTIONARY[animalIndex]}-${number}`;
}

/** 일별 익명 ID (챌린지 진행 중 사용) */
export function createDailyAnonymousId(challengeId: string, userId: string): string {
  const salt = process.env.ANON_ID_SALT;
  if (!salt) throw new Error('ANON_SALT_NOT_CONFIGURED');
  const kstText = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const source = `${challengeId}:${userId}:${kstText}:${salt}`;
  const seed = createHash('sha256').update(source).digest('hex');
  const animalIndex = parseInt(seed.slice(0, 8), 16) % ANIMAL_DICTIONARY.length;
  const number = (parseInt(seed.slice(8, 16), 16) % 900) + 100;
  return `${ANIMAL_DICTIONARY[animalIndex]}-${number}`;
}
