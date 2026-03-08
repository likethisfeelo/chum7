// backend/services/admin/category-banners/upsert/index.ts
// Admin: POST /admin/category-banners/{slug}
// Creates a new banner entry for the given category.
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const VALID_SLUGS = [
  'health', 'mindfulness', 'habit', 'creativity',
  'development', 'relationship', 'expand', 'impact',
];

const bannerSchema = z.object({
  imageUrl:    z.string().url().optional(),
  tagline:     z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(300).optional(),
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
    const slug = event.pathParameters?.slug;
    if (!slug || !VALID_SLUGS.includes(slug)) {
      return response(400, { error: 'INVALID_SLUG' });
    }

    const body = JSON.parse(event.body || '{}');
    const parsed = bannerSchema.safeParse(body);
    if (!parsed.success) {
      return response(400, { error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const bannerId = uuidv4();
    const now = new Date().toISOString();

    const item = {
      slug,
      bannerId,
      imageUrl:    parsed.data.imageUrl ?? null,
      tagline:     parsed.data.tagline ?? null,
      description: parsed.data.description ?? null,
      isActive:    'false', // not active by default; use activate endpoint
      createdAt:   now,
      updatedAt:   now,
    };

    await docClient.send(
      new PutCommand({
        TableName: process.env.CATEGORY_BANNERS_TABLE!,
        Item: item,
      }),
    );

    return response(201, { data: item });
  } catch (err) {
    console.error('admin/category-banners/upsert error', err);
    return response(500, { error: 'INTERNAL_ERROR' });
  }
};
