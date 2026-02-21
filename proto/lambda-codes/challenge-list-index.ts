// backend/services/challenge/list/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify(body)
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const params = event.queryStringParameters || {};
    const category = params.category; // 'health', 'habit', 'self-development', etc.
    const sortBy = params.sortBy || 'popular'; // 'popular', 'latest', 'completion'
    const limit = parseInt(params.limit || '20');

    let items;

    if (category) {
      // 카테고리별 조회
      const result = await docClient.send(new QueryCommand({
        TableName: process.env.CHALLENGES_TABLE!,
        IndexName: 'category-index',
        KeyConditionExpression: 'category = :category',
        ExpressionAttributeValues: {
          ':category': category
        },
        Limit: limit
      }));
      items = result.Items || [];
    } else {
      // 전체 조회
      const result = await docClient.send(new ScanCommand({
        TableName: process.env.CHALLENGES_TABLE!,
        Limit: limit
      }));
      items = result.Items || [];
    }

    // 정렬
    if (sortBy === 'popular') {
      items.sort((a, b) => (b.stats?.totalParticipants || 0) - (a.stats?.totalParticipants || 0));
    } else if (sortBy === 'latest') {
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === 'completion') {
      items.sort((a, b) => (b.stats?.completionRate || 0) - (a.stats?.completionRate || 0));
    }

    return response(200, {
      success: true,
      data: {
        challenges: items,
        total: items.length,
        filters: {
          category: category || 'all',
          sortBy
        }
      }
    });

  } catch (error: any) {
    console.error('List challenges error:', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
