/**
 * content 테이블 — 카테고리 배너 CRUD (키 설계: 이전 가이드 §3 content,
 * gamification-api repo/banners.ts 조회 키 패턴과 동일 계약).
 *  pk=`BANNER#<slug>`, sk=`<bannerId>`
 *  활성 배너: gsi1pk=`BANNERACTIVE#<slug>`, gsi1sk=`<sortOrder>` — 활성 아이템에만 기록(sparse).
 * 활성화 트랜잭션이 gsi1 키를 유지한다 (비활성화 시 REMOVE).
 */
import { DeleteCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

const TABLE = 'CONTENT_TABLE';

export const bannerPk = (slug: string) => `BANNER#${slug}`;

export const VALID_BANNER_SLUGS = [
  'health', 'mindfulness', 'habit', 'creativity', 'development', 'relationship', 'expand', 'impact',
] as const;

/** slug의 배너 전체 (활성/비활성) — 최신 bannerId 우선 (레거시 ScanIndexForward false 승계) */
export async function listBanners(slug: string): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': bannerPk(slug) },
      ScanIndexForward: false,
    }),
  );
  return res.Items ?? [];
}

export async function putBanner(item: Record<string, any>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName(TABLE), Item: item }));
}

export async function deleteBanner(slug: string, bannerId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: tableName(TABLE), Key: { pk: bannerPk(slug), sk: bannerId } }),
  );
}

/**
 * 배너 활성화 트랜잭션 (레거시 activate 승계 + BANNERACTIVE gsi1 유지):
 *  대상: isActive='true' + gsi1pk=BANNERACTIVE#<slug>/gsi1sk=<sortOrder>
 *  나머지: isActive='false' + gsi1 키 REMOVE
 */
export async function activateBannerTransaction(
  slug: string,
  targetBannerId: string,
  allBanners: Record<string, any>[],
  nowIso: string,
): Promise<void> {
  const transactItems = allBanners.map((banner) => {
    const isTarget = banner.bannerId === targetBannerId;
    if (isTarget) {
      return {
        Update: {
          TableName: tableName(TABLE),
          Key: { pk: bannerPk(slug), sk: String(banner.bannerId) },
          UpdateExpression: 'SET isActive = :active, updatedAt = :now, gsi1pk = :gpk, gsi1sk = :gsk',
          ExpressionAttributeValues: {
            ':active': 'true',
            ':now': nowIso,
            ':gpk': `BANNERACTIVE#${slug}`,
            ':gsk': String(banner.sortOrder ?? '0'),
          },
        },
      };
    }
    return {
      Update: {
        TableName: tableName(TABLE),
        Key: { pk: bannerPk(slug), sk: String(banner.bannerId) },
        UpdateExpression: 'SET isActive = :active, updatedAt = :now REMOVE gsi1pk, gsi1sk',
        ExpressionAttributeValues: { ':active': 'false', ':now': nowIso },
      },
    };
  });

  // TransactWrite 100건 제한 — 청크 처리 (대상 포함 청크 우선)
  for (let i = 0; i < transactItems.length; i += 100) {
    await docClient.send(new TransactWriteCommand({ TransactItems: transactItems.slice(i, i + 100) }));
  }
}
