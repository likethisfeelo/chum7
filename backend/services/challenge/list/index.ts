// backend/services/challenge/list/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

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
    const lifecycleFilter = params.lifecycle || null; // 'recruiting', 'active', 'preparing', etc.

    // Scan 전체 테이블 후 JS에서 필터링 (GSI sort key endDate 누락 이슈 방지)
    const scanParams: any = {
      TableName: process.env.CHALLENGES_TABLE!,
    };
    if (category) {
      scanParams.FilterExpression = 'category = :category';
      scanParams.ExpressionAttributeValues = { ':category': category };
    }
    const result = await docClient.send(new ScanCommand(scanParams));
    let items = result.Items || [];

    // 조회 불가/비활성 챌린지 숨김 (admin 콘솔 포함 공통 정책)
    items = items.filter((item: any) => item?.isVisible !== false && item?.isActive !== false);

    // lifecycle 필터
    if (lifecycleFilter) {
      items = items.filter((item: any) => item?.lifecycle === lifecycleFilter);
    }

    // 정렬
    if (sortBy === 'popular') {
      items.sort((a, b) => (b.stats?.totalParticipants || 0) - (a.stats?.totalParticipants || 0));
    } else if (sortBy === 'latest') {
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === 'completion') {
      items.sort((a, b) => (b.stats?.completionRate || 0) - (a.stats?.completionRate || 0));
    }

    // 정렬 후 limit 적용
    items = items.slice(0, limit);

    return response(200, {
      success: true,
      data: {
        challenges: items,
        total: items.length,
        filters: {
          category: category || 'all',
          sortBy,
          lifecycle: lifecycleFilter || 'all'
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