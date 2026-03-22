import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

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

function normalizeProgress(progress: any): any[] {
  if (!progress) return [];
  if (Array.isArray(progress)) return progress;
  if (typeof progress === 'object') return Object.values(progress);
  return [];
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const verificationId = event.pathParameters?.verificationId;
    if (!verificationId) {
      return response(400, { error: 'MISSING_ID', message: 'verificationId가 필요합니다' });
    }

    // 1. 인증 레코드 조회
    const verResult = await docClient.send(new GetCommand({
      TableName: process.env.VERIFICATIONS_TABLE!,
      Key: { verificationId },
    }));

    if (!verResult.Item) {
      return response(404, { error: 'NOT_FOUND', message: '인증을 찾을 수 없습니다' });
    }

    const verification = verResult.Item;

    if (verification.userId !== userId) {
      return response(403, { error: 'FORBIDDEN', message: '본인 인증만 삭제할 수 있습니다' });
    }

    if (verification.isExtra) {
      return response(400, { error: 'EXTRA_NOT_ALLOWED', message: '추가 인증은 삭제할 수 없습니다' });
    }

    // 2. 오늘 인증인지 확인 (timezone 고려)
    const timezone = verification.timezone || 'Asia/Seoul';
    const nowLocal = toZonedTime(new Date(), timezone);
    const todayStr = format(nowLocal, 'yyyy-MM-dd');

    if (verification.verificationDate !== todayStr) {
      return response(400, { error: 'ONLY_TODAY_ALLOWED', message: '오늘 인증만 삭제할 수 있습니다' });
    }

    // 3. userChallenge progress 리셋
    const { userChallengeId, day } = verification;

    if (userChallengeId && day != null) {
      const ucResult = await docClient.send(new GetCommand({
        TableName: process.env.USER_CHALLENGES_TABLE!,
        Key: { userChallengeId },
      }));

      const userChallenge = ucResult.Item;
      if (userChallenge) {
        const progress = normalizeProgress(userChallenge.progress);
        const dayNum = Number(day);

        // 해당 day 항목 제거
        const updatedProgress = progress.filter((p: any) => Number(p?.day) !== dayNum);

        // score, consecutiveDays 재계산
        const totalScore = updatedProgress
          .filter((p: any) => p.status === 'success')
          .reduce((sum: number, p: any) => sum + (p.score || 0), 0);

        let consecutiveDays = 0;
        const maxDay = dayNum - 1;
        for (let i = 1; i <= maxDay; i++) {
          const p = updatedProgress.find((pr: any) => Number(pr?.day) === i);
          if (p && p.status === 'success') {
            consecutiveDays++;
          } else {
            break;
          }
        }

        await docClient.send(new UpdateCommand({
          TableName: process.env.USER_CHALLENGES_TABLE!,
          Key: { userChallengeId },
          UpdateExpression: 'SET progress = :progress, currentDay = :currentDay, score = :score, consecutiveDays = :consecutiveDays, updatedAt = :now',
          ExpressionAttributeValues: {
            ':progress': updatedProgress,
            ':currentDay': dayNum,
            ':score': totalScore,
            ':consecutiveDays': consecutiveDays,
            ':now': new Date().toISOString(),
          },
        }));
      }
    }

    // 4. 인증 레코드 삭제
    await docClient.send(new DeleteCommand({
      TableName: process.env.VERIFICATIONS_TABLE!,
      Key: { verificationId },
    }));

    return response(200, { success: true, message: '인증이 삭제됐어요' });
  } catch (error: any) {
    console.error('Delete verification error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
