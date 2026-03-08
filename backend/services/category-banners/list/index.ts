// backend/services/category-banners/list/index.ts
// Public: GET /category-banners
// Returns the active banner for each category. Falls back to null fields if none set.
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CATEGORY_SLUGS = [
  'health', 'mindfulness', 'habit', 'creativity',
  'development', 'relationship', 'expand', 'impact',
];

function response(statusCode: number, body: any): APIGatewayProxyResult {
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

export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const banners: Record<string, any> = {};

    await Promise.all(
      CATEGORY_SLUGS.map(async (slug) => {
        const result = await docClient.send(
          new QueryCommand({
            TableName: process.env.CATEGORY_BANNERS_TABLE!,
            IndexName: 'slug-isActive-index',
            KeyConditionExpression: 'slug = :slug AND isActive = :active',
            ExpressionAttributeValues: {
              ':slug': slug,
              ':active': 'true',
            },
            Limit: 1,
          }),
        );
        const item = result.Items?.[0];
        banners[slug] = item
          ? { slug, bannerId: item.bannerId, imageUrl: item.imageUrl ?? null, tagline: item.tagline ?? null, description: item.description ?? null }
          : { slug, bannerId: null, imageUrl: null, tagline: null, description: null };
      }),
    );

    return response(200, {
      data: CATEGORY_SLUGS.map((slug) => banners[slug]),
    });
  } catch (err) {
    console.error('category-banners/list error', err);
    return response(500, { error: 'INTERNAL_ERROR' });
  }
};
