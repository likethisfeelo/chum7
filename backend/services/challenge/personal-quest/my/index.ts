import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const challengeId = event.pathParameters?.challengeId;

    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    if (!challengeId) {
      return response(400, { error: 'MISSING_CHALLENGE_ID', message: '챌린지 ID가 필요합니다' });
    }

    const result = await docClient.send(new QueryCommand({
      TableName: process.env.PERSONAL_QUEST_PROPOSALS_TABLE!,
      IndexName: 'userId-challengeId-index',
      KeyConditionExpression: 'userId = :uid AND challengeId = :cid',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':cid': challengeId,
      },
    }));

    const proposals = (result.Items || []).sort((a: any, b: any) =>
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
    );

    return response(200, {
      success: true,
      data: {
        latestProposal: proposals[0] || null,
        proposals,
      },
    });
  } catch (error) {
    console.error('Get my personal quest proposals error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
