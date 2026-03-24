import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function apiResponse(statusCode: number, body: any): APIGatewayProxyResult {
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
    if (!userId) return apiResponse(401, { error: 'UNAUTHORIZED' });

    const { challengeId } = event.pathParameters ?? {};
    if (!challengeId) return apiResponse(400, { error: 'MISSING_CHALLENGE_ID' });

    const challengeRes = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      ProjectionExpression: 'challengeId, createdBy, lifecycle, recruitingStartAt',
    }));

    const challenge = challengeRes.Item;
    if (!challenge) return apiResponse(404, { error: 'CHALLENGE_NOT_FOUND' });

    // 소유권 체크
    if (challenge.createdBy !== userId) {
      return apiResponse(403, { error: 'FORBIDDEN', message: '본인이 만든 챌린지만 공개할 수 있어요' });
    }

    if (challenge.lifecycle !== 'draft') {
      return apiResponse(409, { error: 'ALREADY_PUBLISHED', message: '이미 공개된 챌린지예요' });
    }

    const now = new Date();
    const recruitingStart = new Date(challenge.recruitingStartAt as string);

    if (recruitingStart > now) {
      return apiResponse(400, {
        error: 'RECRUITING_NOT_STARTED',
        message: `모집 시작 시각(${challenge.recruitingStartAt})이 아직 되지 않았어요`,
      });
    }

    await docClient.send(new UpdateCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      UpdateExpression: 'SET lifecycle = :recruiting, updatedAt = :now',
      ExpressionAttributeValues: {
        ':recruiting': 'recruiting',
        ':now': now.toISOString(),
      },
    }));

    return apiResponse(200, {
      success: true,
      message: '챌린지 모집이 시작됐어요!',
      data: { challengeId, lifecycle: 'recruiting' },
    });
  } catch (err) {
    console.error('[challenge/publish] error:', err);
    return apiResponse(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
