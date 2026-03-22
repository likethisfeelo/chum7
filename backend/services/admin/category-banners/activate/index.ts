// backend/services/admin/category-banners/activate/index.ts
// Admin: PUT /admin/category-banners/{slug}/{bannerId}/activate
// Sets the given bannerId as the active banner for a category,
// deactivating all other banners for the same slug.
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const slug     = event.pathParameters?.slug;
    const bannerId = event.pathParameters?.bannerId;
    if (!slug || !bannerId) return response(400, { error: 'MISSING_PARAMS' });

    // Fetch all banners for this slug
    const allResult = await docClient.send(
      new QueryCommand({
        TableName: process.env.CATEGORY_BANNERS_TABLE!,
        KeyConditionExpression: 'slug = :slug',
        ExpressionAttributeValues: { ':slug': slug },
      }),
    );
    const allBanners = allResult.Items || [];

    const target = allBanners.find((b) => b.bannerId === bannerId);
    if (!target) return response(404, { error: 'BANNER_NOT_FOUND' });

    const now = new Date().toISOString();

    // Transact: set target isActive='true', all others isActive='false'
    const transactItems = allBanners.map((banner) => ({
      Update: {
        TableName: process.env.CATEGORY_BANNERS_TABLE!,
        Key: { slug: banner.slug, bannerId: banner.bannerId },
        UpdateExpression: 'SET isActive = :active, updatedAt = :now',
        ExpressionAttributeValues: {
          ':active': banner.bannerId === bannerId ? 'true' : 'false',
          ':now': now,
        },
      },
    }));

    // DynamoDB TransactWrite supports up to 100 items
    await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));

    return response(200, { data: { slug, activeBannerId: bannerId } });
  } catch (err) {
    console.error('admin/category-banners/activate error', err);
    return response(500, { error: 'INTERNAL_ERROR' });
  }
};
