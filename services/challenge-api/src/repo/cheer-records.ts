/**
 * cheer 테이블 쓰기 (크로스 도메인 예외) — 조기완료 자동응원 레코드 생성 전용.
 * 발송 전이·감사점수 처리는 cheer-scheduler 워커가 담당하므로 여기서는 레코드 생성만 한다.
 * (cheer-scheduler가 challenges.thankScore를 ADD하는 것과 대칭인, 문서화된 크로스 도메인 쓰기.)
 */
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

const CHEER_TABLE = 'CHEER_TABLE';

/** META + SENDER 프로젝션 2건 put (cheer-api putCheerWithProjection과 동일 — 비트랜잭션) */
export async function putCheerRecords(
  meta: Record<string, any>,
  sentProjection: Record<string, any>,
): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName(CHEER_TABLE), Item: meta }));
  await docClient.send(new PutCommand({ TableName: tableName(CHEER_TABLE), Item: sentProjection }));
}
