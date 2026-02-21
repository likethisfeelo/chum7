// backend/services/verification/get/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

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
    const verificationId = event.pathParameters?.verificationId;

    if (!verificationId) {
      return response(400, {
        error: 'MISSING_VERIFICATION_ID',
        message: '인증 ID가 필요합니다'
      });
    }

    const result = await docClient.send(new GetCommand({
      TableName: process.env.VERIFICATIONS_TABLE!,
      Key: { verificationId }
    }));

    if (!result.Item) {
      return response(404, {
        error: 'VERIFICATION_NOT_FOUND',
        message: '인증을 찾을 수 없습니다'
      });
    }

    return response(200, {
      success: true,
      data: result.Item
    });

  } catch (error: any) {
    console.error('Get verification error:', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};