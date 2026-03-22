// backend/services/admin/category-banners/list/index.ts
// Admin: GET /admin/category-banners/{slug}
// Returns all banners for a given category (active and inactive).
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

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
    const slug = event.pathParameters?.slug;
    if (!slug) return response(400, { error: 'MISSING_SLUG' });

    const result = await docClient.send(
      new QueryCommand({
        TableName: process.env.CATEGORY_BANNERS_TABLE!,
        KeyConditionExpression: 'slug = :slug',
        ExpressionAttributeValues: { ':slug': slug },
        ScanIndexForward: false, // newest first
      }),
    );

    return response(200, { data: { banners: result.Items || [] } });
  } catch (err) {
    console.error('admin/category-banners/list error', err);
    return response(500, { error: 'INTERNAL_ERROR' });
  }
};
