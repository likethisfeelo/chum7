/**
 * challenges 테이블 읽기 전용 액세스 — 문서화된 크로스 도메인 예외 (이전 가이드 §4,
 * gamification-api 예외를 미러링. PORTING.md §3에 기록):
 * "cheer-api → challenges 테이블 read-only" — 응원 대상 추천(get-targets)과 발송 검증이
 * 레거시 USER_CHALLENGES_TABLE(참여/progress)을 읽던 것을 승계한다.
 *
 * 쓰기 금지. 이 파일 외부에서 CHALLENGES_TABLE 접근 금지.
 * (thankScore 적립 쓰기는 cheer-scheduler 워커의 별도 문서화 예외 — 이 API에는 없음.)
 */
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

const TABLE = 'CHALLENGES_TABLE';

const challengePk = (challengeId: string) => `CHAL#${challengeId}`;

/** 챌린지 본문 META (수신자 목표 시간 폴백 targetTime 조회용) */
export async function getChallengeMeta(challengeId: string): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: challengePk(challengeId), sk: 'META' } }),
  );
  return res.Item;
}

/** 참여(user-challenge) 단건 — pk=CHAL#<challengeId>/sk=UC#<userId> */
export async function getParticipation(
  challengeId: string,
  userId: string,
): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: challengePk(challengeId), sk: `UC#${userId}` } }),
  );
  return res.Item;
}

/** 챌린지 참여자 전체 — pk 파티션 UC# prefix Query (레거시 groupId-index 대응) */
export async function listChallengeParticipations(challengeId: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :uc)',
        ExpressionAttributeValues: { ':pk': challengePk(challengeId), ':uc': 'UC#' },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
