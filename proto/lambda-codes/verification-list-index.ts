// backend/services/verification/list/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

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
    const userId = params.userId || event.requestContext.authorizer?.jwt?.claims?.sub;
    const userChallengeId = params.userChallengeId;
    const isPublic = params.isPublic; // 'true' for public feed
    const limit = parseInt(params.limit || '20');

    let result;

    if (userChallengeId) {
      // 특정 챌린지의 인증 목록
      result = await docClient.send(new QueryCommand({
        TableName: process.env.VERIFICATIONS_TABLE!,
        IndexName: 'userChallengeId-index',
        KeyConditionExpression: 'userChallengeId = :userChallengeId',
        ExpressionAttributeValues: {
          ':userChallengeId': userChallengeId
        },
        ScanIndexForward: true, // Day 순서대로
        Limit: limit
      }));
    } else if (isPublic === 'true') {
      // 공개 피드
      result = await docClient.send(new QueryCommand({
        TableName: process.env.VERIFICATIONS_TABLE!,
        IndexName: 'public-feed-index',
        KeyConditionExpression: 'isPublic = :isPublic',
        ExpressionAttributeValues: {
          ':isPublic': 'true'
        },
        ScanIndexForward: false, // 최신순
        Limit: limit
      }));
    } else if (userId) {
      // 특정 사용자의 인증 목록
      result = await docClient.send(new QueryCommand({
        TableName: process.env.VERIFICATIONS_TABLE!,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        },
        ScanIndexForward: false, // 최신순
        Limit: limit
      }));
    } else {
      return response(400, {
        error: 'MISSING_QUERY_PARAMS',
        message: 'userId, userChallengeId 또는 isPublic 파라미터가 필요합니다'
      });
    }

    const verifications = result.Items || [];

    return response(200, {
      success: true,
      data: {
        verifications,
        total: verifications.length
      }
    });

  } catch (error: any) {
    console.error('List verifications error:', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
