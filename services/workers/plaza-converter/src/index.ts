/**
 * plaza-converter — 공개 인증 → 마당(courtyard) 게시물 변환 워커
 * (EventBridge 매 1시간, plain Lambda handler).
 * 레거시 backend/services/plaza/convert-verifications 이식 (상세: PORTING.md).
 *
 *  1. challenges gsi2 `VFPUB#<KST 오늘>`(+어제, 자정 경계) Query — createdAt > high-water mark
 *     (레거시 isPublic-createdAt-index 전체 페이지네이션 → 파티션+워터마크 Query 재작성)
 *  2. type=normal · 미변환(plazaConvertedAt 없음)만 social 테이블에 게시물 조건부 Put
 *     (아이템 계약: services/social-api/PORTING.md §4 — POST#courtyard-<vid>/META + FEED#courtyard)
 *  3. hashtag 있으면 TAG#<tag>/META 레지스트리 유지 (최초 등록 + postCount 증분)
 *  4. 인증 아이템에 변환 마커 plazaConvertedAt 기록 (레거시 isConvertedToPlaza 대응)
 *
 * 테이블: challenges(R + 마커 W) + social(W) — 문서화된 크로스 도메인 예외 (이전 가이드 §4).
 */
import type { EventBridgeEvent } from 'aws-lambda';
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import {
  buildHashtagRegistryItem,
  buildPlazaPostItem,
  conversionWindow,
  decideConvert,
  DEFAULT_LOOKBACK_HOURS,
} from './domain/convert';

const CHALLENGES_TABLE = 'CHALLENGES_TABLE';
const SOCIAL_TABLE = 'SOCIAL_TABLE';

function resolveLookbackHours(): number {
  const parsed = Number(process.env.PLAZA_CONVERT_LOOKBACK_HOURS ?? DEFAULT_LOOKBACK_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LOOKBACK_HOURS;
}

/** 파티션 1개의 공개 인증 페이지네이션 Query (gsi2sk=createdAt > 워터마크) */
async function listPublicVerifications(kstDate: string, sinceIso: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(CHALLENGES_TABLE),
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :pub AND gsi2sk > :since',
        ExpressionAttributeValues: { ':pub': `VFPUB#${kstDate}`, ':since': sinceIso },
        ExclusiveStartKey: lastKey,
        Limit: 100,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** 게시물 조건부 Put — attribute_not_exists(pk) 중복 변환 방지 (레거시 동일). @returns 신규 기록 여부 */
async function putPlazaPost(item: Record<string, any>): Promise<boolean> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName(SOCIAL_TABLE),
        Item: item,
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

/** 해시태그 레지스트리 유지 — social repo/hashtags.registerHashtag 동일 (최초 등록 + postCount 증분) */
async function registerHashtag(hashtag: string, creatorUserId: string, nowIso: string): Promise<void> {
  await docClient
    .send(
      new PutCommand({
        TableName: tableName(SOCIAL_TABLE),
        Item: buildHashtagRegistryItem(hashtag, creatorUserId, nowIso),
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    )
    .catch((err: any) => {
      if (err?.name !== 'ConditionalCheckFailedException') throw err;
    });

  await docClient.send(
    new UpdateCommand({
      TableName: tableName(SOCIAL_TABLE),
      Key: { pk: `TAG#${hashtag}`, sk: 'META' },
      UpdateExpression: 'SET postCount = if_not_exists(postCount, :zero) + :inc',
      ExpressionAttributeValues: { ':inc': 1, ':zero': 0 },
    }),
  );
}

/** 인증 아이템 변환 마커 — challenges 테이블 쓰기 (워커 RW 권한 소관, 계약 §4) */
async function markVerificationConverted(
  verification: Record<string, any>,
  convertedAt: string,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(CHALLENGES_TABLE),
      Key: { pk: verification.pk, sk: verification.sk },
      UpdateExpression: 'SET plazaConvertedAt = :convertedAt',
      ExpressionAttributeValues: { ':convertedAt': convertedAt },
    }),
  );
}

export const handler = async (event: EventBridgeEvent<string, unknown>) => {
  const now = new Date();
  const convertedAt = now.toISOString();
  const window = conversionWindow(now, resolveLookbackHours());
  console.log(JSON.stringify({
    level: 'info', message: 'plaza-converter triggered', eventId: event.id,
    partitions: window.partitions, since: window.sinceIso,
  }));

  const summary = {
    scannedCount: 0,
    convertedCount: 0,
    skipTypeCount: 0,
    skipAlreadyConvertedCount: 0,
    conditionalDuplicateCount: 0,
    failedCount: 0,
  };
  const seen = new Set<string>();

  for (const kstDate of window.partitions) {
    const verifications = await listPublicVerifications(kstDate, window.sinceIso);
    for (const verification of verifications) {
      const verificationId = String(verification.verificationId ?? '');
      if (!verificationId || seen.has(verificationId)) continue;
      seen.add(verificationId);
      summary.scannedCount += 1;

      const decision = decideConvert(verification);
      if (!decision.convert) {
        if (decision.reason === 'not_normal_type') summary.skipTypeCount += 1;
        else summary.skipAlreadyConvertedCount += 1;
        continue;
      }

      try {
        const post = buildPlazaPostItem(verification, convertedAt);
        const created = await putPlazaPost(post);
        if (!created) summary.conditionalDuplicateCount += 1; // 이미 존재 — 마커만 재기록

        if (created && post.hashtag && verification.userId) {
          await registerHashtag(String(post.hashtag), String(verification.userId), convertedAt);
        }

        await markVerificationConverted(verification, convertedAt);
        if (created) summary.convertedCount += 1;
      } catch (err: any) {
        summary.failedCount += 1;
        console.error(JSON.stringify({
          level: 'error', message: 'verification conversion failed',
          verificationId, error: err?.message ?? String(err),
        }));
      }
    }
  }

  console.log(JSON.stringify({ level: 'info', message: 'plaza-converter summary', ...summary }));
  return { statusCode: 200, body: JSON.stringify({ message: 'Plaza conversion complete', ...summary }) };
};
