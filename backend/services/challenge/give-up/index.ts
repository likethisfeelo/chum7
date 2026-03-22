// backend/services/challenge/give-up/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { grantSpecificBadge } from '../../../shared/lib/badge-grant';

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
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const userChallengeId = event.pathParameters?.userChallengeId;

    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }
    if (!userChallengeId) {
      return response(400, { error: 'MISSING_USER_CHALLENGE_ID', message: 'userChallengeId가 필요합니다' });
    }

    // 1. userChallenge 조회
    const ucResult = await docClient.send(new GetCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Key: { userChallengeId },
    }));

    if (!ucResult.Item) {
      return response(404, { error: 'NOT_FOUND', message: '참여 정보를 찾을 수 없습니다' });
    }

    const uc = ucResult.Item;

    // 2. 본인만 포기 가능
    if (uc.userId !== userId) {
      return response(403, { error: 'FORBIDDEN', message: '본인의 챌린지만 포기할 수 있습니다' });
    }

    // 3. 이미 포기한 경우
    if (uc.phase === 'gave_up' || uc.status === 'gave_up') {
      return response(409, { error: 'ALREADY_GAVE_UP', message: '이미 중도 포기한 챌린지입니다' });
    }

    // 4. 완료/실패한 챌린지는 포기 불가
    if (uc.status === 'completed' || uc.status === 'failed' || uc.phase === 'completed' || uc.phase === 'failed') {
      return response(409, { error: 'CHALLENGE_ALREADY_ENDED', message: '이미 종료된 챌린지는 포기할 수 없습니다' });
    }

    // 5. 챌린지 조회 — 리더 여부 확인
    const challengeResult = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId: uc.challengeId },
    }));

    if (!challengeResult.Item) {
      return response(404, { error: 'CHALLENGE_NOT_FOUND', message: '챌린지를 찾을 수 없습니다' });
    }

    const challenge = challengeResult.Item;

    if (challenge.leaderId === userId) {
      return response(403, { error: 'LEADER_CANNOT_GIVE_UP', message: '챌린지 리더는 포기할 수 없습니다' });
    }

    // 6. gave_up으로 업데이트
    const now = new Date().toISOString();
    await docClient.send(new UpdateCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Key: { userChallengeId },
      UpdateExpression: 'SET #phase = :gaveUp, #status = :gaveUp, gaveUpAt = :now, updatedAt = :now',
      ExpressionAttributeNames: {
        '#phase': 'phase',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':gaveUp': 'gave_up',
        ':now': now,
      },
    }));

    // 7. "포기는쉽다" 뱃지 부여 (챌린지별 1회)
    await grantSpecificBadge({
      badgeId: `gave_up_${uc.challengeId}`,
      userId,
      challengeId: uc.challengeId,
      metadata: { gaveUpAt: now, userChallengeId },
    });

    return response(200, {
      success: true,
      message: '챌린지를 중도 포기했습니다.',
      data: { userChallengeId, phase: 'gave_up', status: 'gave_up' },
    });

  } catch (error: any) {
    console.error('Give up challenge error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
