/**
 * interaction-projector — 관계 원장 워커 (EventBridge rule: source prefix 'chme.').
 * 도메인 이벤트(comment.created·reaction.created·cheer.delivered·challenge.completed)를
 * 사용자쌍 상호작용으로 변환해 graph 테이블에 적재한다:
 *   1) 이벤트 원장 append (멱등 — interactionId 중복 시 스킵)
 *   2) 사용자쌍 집계 양방향 미러 갱신 + 추천 점수/gsi 재계산
 *
 * 공개 표면 아님 — 사용자에게 보이는 화면 없음(P2 단계 A). 데이터만 축적한다.
 * Env: GRAPH_TABLE. 실패는 DLQ로 재처리.
 * 설계: docs/relationship-archive-design.md
 */
import type { EventBridgeEvent } from 'aws-lambda';
import { interactionsFromEvent, MAX_CO_CHALLENGE_USERS } from './domain/pairing';
import { appendLedger, bumpPairStat, markLedgerDeleted } from './repo/relationship';

export async function handler(
  event: EventBridgeEvent<string, Record<string, any>>,
): Promise<void> {
  const type = event['detail-type'];
  const detail = event.detail ?? {};
  const occurredAt = String(detail.occurredAt ?? new Date().toISOString());
  // 팬아웃 상한 — 환경변수로 튜닝 가능(미설정 시 도메인 기본값)
  const coChallengeCap = Number(process.env.CO_CHALLENGE_CAP) || MAX_CO_CHALLENGE_USERS;

  // 콘텐츠 삭제 → 원장 항목 deleted 처리(아카이브 원문 재노출 차단)
  if (type === 'content.deleted') {
    await markLedgerDeleted(String(detail.sourceEntityId ?? ''));
    return;
  }

  // 팬아웃 상한 초과 시 드롭 수 로깅(무언의 상한 금지)
  if (type === 'challenge.completed' && Array.isArray(detail.completedUserIds)) {
    const n = detail.completedUserIds.length;
    if (n > coChallengeCap) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: 'co_challenge fan-out capped',
          challengeId: detail.challengeId,
          completers: n,
          cap: coChallengeCap,
        }),
      );
    }
  }

  const interactions = interactionsFromEvent(type, detail, coChallengeCap);
  if (interactions.length === 0) return;

  for (const x of interactions) {
    try {
      const fresh = await appendLedger(x, occurredAt);
      if (!fresh) continue; // 중복 이벤트 — 집계 갱신 스킵(과다 카운트 방지)
      await bumpPairStat(x, occurredAt);
    } catch (err) {
      // 개별 쌍 실패는 로깅 후 계속 — 이벤트 전체는 DLQ 재처리(멱등이라 안전)
      console.error(
        JSON.stringify({ level: 'error', message: 'projector pair failed', type, interactionId: x.interactionId, error: (err as Error).message }),
      );
      throw err; // 재처리 위해 전체 재시도 유도
    }
  }
}
