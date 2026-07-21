/**
 * 감사 로그 아이템 생성 — 순수 함수 (AWS 무의존).
 * ops 테이블 키 설계 (이전 가이드 §3 ops):
 *   pk=`AUDIT#<YYYY-MM>`, sk=`<ISO ts>#<id>`, gsi1pk=`AUDITTARGET#<targetId>`, gsi1sk=`<ts>`
 * 레거시 PAYOUT_AUDIT_LOGS_TABLE 기록 패턴(review-payout)을 전 어드민 변이 라우트로 일반화.
 */

export const PAYLOAD_SUMMARY_MAX_LENGTH = 1000;

export interface AuditInput {
  actorUserId: string;
  /** 예: 'challenge.create', 'quest.review', 'cheer.dlq.requeue' */
  action: string;
  targetType: string;
  targetId: string;
  /** 요청 페이로드 — 요약(JSON 직렬화 후 절단)으로만 저장 */
  payload?: unknown;
  id: string;
  now: Date;
}

/** 페이로드 요약 — JSON 직렬화 후 최대 길이 절단. 직렬화 불가/비어있으면 null. */
export function summarizePayload(payload: unknown, maxLength = PAYLOAD_SUMMARY_MAX_LENGTH): string | null {
  if (payload === undefined || payload === null) return null;
  let serialized: string;
  try {
    serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  } catch {
    return null;
  }
  if (!serialized) return null;
  return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}…` : serialized;
}

export function auditMonthOf(ts: string): string {
  return ts.slice(0, 7); // YYYY-MM
}

export function buildAuditItem(input: AuditInput): Record<string, unknown> {
  const ts = input.now.toISOString();
  return {
    pk: `AUDIT#${auditMonthOf(ts)}`,
    sk: `${ts}#${input.id}`,
    gsi1pk: `AUDITTARGET#${input.targetId}`,
    gsi1sk: ts,
    auditId: input.id,
    actorUserId: input.actorUserId,
    action: input.action,
    target: { type: input.targetType, id: input.targetId },
    payloadSummary: summarizePayload(input.payload),
    createdAt: ts,
  };
}
