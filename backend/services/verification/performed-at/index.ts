import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { calculateEffectiveCurrentDay, resolveDurationDays } from '../../../shared/lib/challenge-day-sync';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const performedAtSchema = z.object({
  performedAt: z.string().datetime()
});

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
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const verificationId = event.pathParameters?.verificationId;
    if (!verificationId) {
      return response(400, { error: 'MISSING_VERIFICATION_ID', message: 'verificationId가 필요합니다' });
    }

    const { performedAt } = performedAtSchema.parse(JSON.parse(event.body || '{}'));

    if (new Date(performedAt).getTime() > Date.now()) {
      return response(400, { error: 'FUTURE_PERFORMED_AT', message: '수행 시간은 미래로 설정할 수 없습니다' });
    }

    const verificationResult = await docClient.send(new GetCommand({
      TableName: process.env.VERIFICATIONS_TABLE!,
      Key: { verificationId }
    }));

    if (!verificationResult.Item) {
      return response(404, { error: 'VERIFICATION_NOT_FOUND', message: '인증을 찾을 수 없습니다' });
    }

    const verification = verificationResult.Item;
    if (verification.userId !== userId) {
      return response(403, { error: 'FORBIDDEN', message: '본인 인증만 수정할 수 있습니다' });
    }

    if (!verification.userChallengeId) {
      return response(400, { error: 'MISSING_USER_CHALLENGE', message: 'userChallengeId가 없습니다' });
    }

    const userChallengeResult = await docClient.send(new GetCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Key: { userChallengeId: verification.userChallengeId }
    }));

    const userChallenge = userChallengeResult.Item;
    if (!userChallenge) {
      return response(404, { error: 'USER_CHALLENGE_NOT_FOUND', message: '챌린지 참여정보를 찾을 수 없습니다' });
    }

    const durationDays = resolveDurationDays(undefined, userChallenge.progress);
    const effectiveCurrentDay = calculateEffectiveCurrentDay(
      userChallenge,
      new Date().toISOString(),
      durationDays,
    );

    if (effectiveCurrentDay > durationDays || userChallenge.status === 'completed' || userChallenge.status === 'failed') {
      return response(400, { error: 'CHALLENGE_PERIOD_ENDED', message: '챌린지 기간 내에만 수행 시간을 수정할 수 있습니다' });
    }

    await docClient.send(new UpdateCommand({
      TableName: process.env.VERIFICATIONS_TABLE!,
      Key: { verificationId },
      UpdateExpression: 'SET performedAt = :performedAt, practiceAt = :performedAt, completedAt = :performedAt, updatedAt = :now',
      ExpressionAttributeValues: {
        ':performedAt': performedAt,
        ':now': new Date().toISOString()
      }
    }));

    return response(200, { success: true, performedAt });
  } catch (error: any) {
    console.error('Update performed-at error:', error);

    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', message: '요청값이 올바르지 않습니다', details: error.errors });
    }

    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
