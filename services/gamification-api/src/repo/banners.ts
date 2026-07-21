import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

/**
 * content 테이블 — 카테고리 배너 (키 설계: 이전 가이드 §3 content).
 *  pk=`BANNER#<slug>`, sk=`<bannerId>`
 *  활성 배너 조회: gsi1pk=`BANNERACTIVE#<slug>`, gsi1sk=`<sortOrder>` (활성만 기록되는 sparse GSI)
 *  레거시 CATEGORY_BANNERS_TABLE slug-isActive-index Query(Limit 1) 대응.
 */
const TABLE = 'CONTENT_TABLE';

export interface BannerItem {
  bannerId: string;
  slug: string;
  imageUrl?: string | null;
  tagline?: string | null;
  description?: string | null;
}

/** slug의 활성 배너 1건 (sortOrder 오름차순 첫 항목 — 레거시 Limit 1 승계) */
export async function getActiveBanner(slug: string): Promise<BannerItem | undefined> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': `BANNERACTIVE#${slug}` },
      ScanIndexForward: true,
      Limit: 1,
    }),
  );
  return res.Items?.[0] as BannerItem | undefined;
}
