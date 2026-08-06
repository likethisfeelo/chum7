import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

/**
 * 챌린지 리더 판별용 단일키 조회 — challenges 테이블 pk=CHAL#<id>/sk=META.
 * 스캔이 아닌 GetItem 1회(리더 검증 전용). 크로스 도메인 "풀스캔 금지" 원칙은 유지된다.
 * CHALLENGES_TABLE 미설정 시 null(리더 모드 불가로 안전 폴백).
 */
export async function getChallengeLeaderId(challengeId: string): Promise<string | null> {
  if (!process.env.CHALLENGES_TABLE || !challengeId) return null;
  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: tableName('CHALLENGES_TABLE'),
        Key: { pk: `CHAL#${challengeId}`, sk: 'META' },
      }),
    );
    const item = res.Item;
    if (!item) return null;
    // leaderId가 명시되면 우선, 없으면 생성자(createdBy)를 리더로 간주
    return (item.leaderId as string) || (item.createdBy as string) || null;
  } catch {
    return null;
  }
}

/** 리더+매니저 판별 — 가이드 게시판 등 운영진 전용 쓰기 가드용 (GetItem 1회). */
export async function getChallengeStaff(
  challengeId: string,
): Promise<{ leaderId: string; managerIds: string[] } | null> {
  if (!process.env.CHALLENGES_TABLE || !challengeId) return null;
  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: tableName('CHALLENGES_TABLE'),
        Key: { pk: `CHAL#${challengeId}`, sk: 'META' },
      }),
    );
    const item = res.Item;
    if (!item) return null;
    const leaderId = (item.leaderId as string) || (item.createdBy as string) || '';
    const managerIds = Array.isArray(item.managerIds) ? item.managerIds.map(String) : [];
    if (!leaderId) return null;
    return { leaderId, managerIds };
  } catch {
    return null;
  }
}

export interface ChallengeRef {
  leaderId: string;
  category: string;
  title: string;
}

/** 관심영역 구독용 — 챌린지 META에서 리더/카테고리/제목을 함께 조회 (GetItem 1회). */
export async function getChallengeRef(challengeId: string): Promise<ChallengeRef | null> {
  if (!process.env.CHALLENGES_TABLE || !challengeId) return null;
  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: tableName('CHALLENGES_TABLE'),
        Key: { pk: `CHAL#${challengeId}`, sk: 'META' },
      }),
    );
    const item = res.Item;
    if (!item) return null;
    const leaderId = (item.leaderId as string) || (item.createdBy as string) || '';
    const category = (item.category as string) || '';
    if (!leaderId || !category) return null;
    return { leaderId, category, title: (item.title as string) || '' };
  } catch {
    return null;
  }
}
