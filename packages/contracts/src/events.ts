import { z } from 'zod';

/**
 * 도메인 이벤트 계약 (EventBridge 커스텀 버스).
 * - source: `chme.<도메인>`  /  detailType: 아래 유니온의 `type`
 * - 이벤트는 "통지"이며 트랜잭션이 아니다 (REDESIGN_PLAN §3.2).
 */
export const EVENT_SOURCE_PREFIX = 'chme.';

export const domainEventSchemas = {
  'cheer.delivered': z.object({
    cheerId: z.string(),
    senderId: z.string(),
    receiverId: z.string(),
    challengeId: z.string(),
    day: z.number().int().optional(),
  }),
  'challenge.completed': z.object({
    challengeId: z.string(),
    completedUserIds: z.array(z.string()),
  }),
  // 챌린지 모집 시작(draft→recruiting) — 관심영역(리더+카테고리) 구독자에게 알림 팬아웃 신호.
  'challenge.recruiting': z.object({
    challengeId: z.string(),
    leaderId: z.string(),
    category: z.string(),
    title: z.string(),
  }),
  // 리더가 챌린지를 해산(전체 종료) — 참여 멤버 전원에게 '리더가 해산했어요' 팬아웃.
  //  무료: 리더가 즉시 실행 / 유료: 운영자 승인 후 실행. 둘 다 이 이벤트로 통지.
  'challenge.disbanded': z.object({
    challengeId: z.string(),
    leaderId: z.string(),
    title: z.string().optional(),
    // 알림 팬아웃 수신자 — 리더 제외한 참여 멤버 userId 목록
    memberIds: z.array(z.string()),
  }),
  // 유료 챌린지 해산 신청(리더→운영자) — 접수 확인을 리더에게 통지.
  'challenge.disband_requested': z.object({
    challengeId: z.string(),
    leaderId: z.string(),
    requestId: z.string(),
    reason: z.string(),
  }),
  // 운영자가 해산 신청을 반려 — 리더에게 사유와 함께 통지.
  'challenge.disband_rejected': z.object({
    challengeId: z.string(),
    leaderId: z.string(),
    requestId: z.string(),
    reason: z.string().optional(),
  }),
  'comment.created': z.object({
    targetType: z.enum(['plaza', 'board', 'verification', 'bulletin', 'personal']),
    targetId: z.string(),
    targetOwnerId: z.string(),
    authorId: z.string(),
    commentId: z.string(),
    // 알림 딥링크용 — verification 대상일 때 /challenge-feed/:challengeId
    challengeId: z.string().optional(),
    // 작성 당시 공개 활동명(아무개N·수달N·챌린지 리더) — 관계 아카이브 타임라인 스냅샷용
    actorDisplayName: z.string().optional(),
  }),
  // 리액션(좋아요/이모지) — 관계 원장(interaction-projector) 소스. 통지가 아니라 집계 신호.
  'reaction.created': z.object({
    targetType: z.enum(['plaza', 'board', 'verification']),
    targetId: z.string(),
    targetOwnerId: z.string(),
    actorUserId: z.string(),
    emoji: z.string().optional(),
  }),
  // 콘텐츠 삭제 — 관계 아카이브에서 원본 재노출 금지(원장 visibilityState=deleted 동기화).
  'content.deleted': z.object({
    targetType: z.enum(['plaza', 'board', 'verification', 'bulletin']),
    sourceEntityType: z.string(), // comment | post | verification ...
    sourceEntityId: z.string(),
  }),
  'follow.requested': z.object({
    followerId: z.string(),
    followeeId: z.string(),
  }),
  'follow.accepted': z.object({
    followerId: z.string(),
    followeeId: z.string(),
  }),
  'friend.requested': z.object({
    requesterId: z.string(),
    targetUserId: z.string(),
  }),
  'friend.accepted': z.object({
    accepterId: z.string(),
    requesterId: z.string(),
  }),
  'feed.invite_link_used': z.object({
    ownerId: z.string(),
    usedByUserId: z.string(),
    token: z.string(),
  }),
  'verification.submitted': z.object({
    verificationId: z.string(),
    userId: z.string(),
    challengeId: z.string(),
    day: z.number().int(),
    isDayComplete: z.boolean(),
    isPublic: z.boolean(),
  }),
  // 리더가 인증 게시물 1건 반려 — 마당(plaza) 변환분 비활성화 소비자용
  'verification.rejected': z.object({
    verificationId: z.string(),
    challengeId: z.string(),
    userId: z.string(),
    day: z.number().int(),
    plazaConverted: z.boolean(),
  }),
  // 관리자가 인증 1건 숨김(신고 처리) — 마당(plaza) 변환분 비활성화 소비자용. 점수 롤백 없음(순수 숨김).
  'verification.hidden': z.object({
    verificationId: z.string(),
    challengeId: z.string(),
    userId: z.string(),
    day: z.number().int(),
    plazaConverted: z.boolean(),
  }),
  // 사용자가 '이 게시물을 N일차 인증으로 인정해달라' 요청 — 수신자는 리더(leaderId)
  'completion.requested': z.object({
    challengeId: z.string(),
    requestId: z.string(),
    userId: z.string(), // 요청자
    leaderId: z.string(), // 알림 수신자(리더)
    day: z.number().int(),
    verificationId: z.string().optional(),
  }),
  // 사용자가 자기 인증 1건의 '해당 일자 완료·점수'를 스스로 취소 — 수신자는 리더(leaderId).
  //  게시물 자체는 남고(노출은 선택) 일자 점수만 해제. 마당(plaza) 변환분은 유지(취소로 내리지 않음).
  'verification.self_cancelled': z.object({
    verificationId: z.string(),
    challengeId: z.string(),
    userId: z.string(), // 취소한 사용자
    leaderId: z.string(), // 알림 수신자(리더)
    day: z.number().int(),
  }),
  // 리더가 인정 요청을 처리 — 수신자는 요청자(userId)
  'completion.resolved': z.object({
    challengeId: z.string(),
    requestId: z.string(),
    userId: z.string(), // 알림 수신자(요청자)
    day: z.number().int(),
    outcome: z.enum(['granted', 'rejected']),
  }),
  // 리더가 이미 승인된 개인 퀘스트 제안을 재반려 — 참여자에게 사유·결과 안내
  'proposal.rerejected': z.object({
    challengeId: z.string(),
    userId: z.string(),
    proposalId: z.string(),
    reason: z.string(),
    // 시작 전 재제출 없을 때의 처리: 'block'(참여 제한) | 'keep_original'(기존 제출본 유지)
    fallback: z.enum(['block', 'keep_original']),
  }),
  // 시작 시점 재제출 미이행 처리 결과 — 참여자 안내
  'proposal.enforced': z.object({
    challengeId: z.string(),
    userId: z.string(),
    proposalId: z.string(),
    outcome: z.enum(['blocked', 'restored']),
  }),
  'order.paid': z.object({
    orderId: z.string(),
    userId: z.string(),
    challengeId: z.string(),
    amount: z.number().int(),
  }),
  // 유료 조인 티켓 — 리더가 유저에게 발급(결제 동일 효력). 수신자는 유저.
  'ticket.granted': z.object({
    ticketId: z.string(),
    challengeId: z.string(),
    userId: z.string(),
    leaderId: z.string(),
    challengeTitle: z.string().optional(),
  }),
  // 유저가 리더에게 티켓을 신청 — 수신자는 리더.
  'ticket.requested': z.object({
    challengeId: z.string(),
    userId: z.string(),
    leaderId: z.string(),
    message: z.string().optional(),
  }),
  // 리더가 티켓 신청을 반려 — 수신자는 유저.
  'ticket.request_rejected': z.object({
    challengeId: z.string(),
    userId: z.string(),
    leaderId: z.string(),
    reason: z.string().optional(),
  }),
  // 리더가 완주자에게 선물 교환권 발행 — 수신자는 유저.
  'gift.issued': z.object({
    voucherId: z.string(),
    challengeId: z.string(),
    userId: z.string(),
    leaderId: z.string(),
    giftName: z.string(),
  }),
  // 유저가 교환권 사용(교환 신청) — 수신자는 리더. 실물이면 배송 준비 신호.
  'gift.claimed': z.object({
    voucherId: z.string(),
    challengeId: z.string(),
    userId: z.string(),
    leaderId: z.string(),
    giftName: z.string(),
    isPhysical: z.boolean(),
  }),
  // 리더가 실물 선물 발송 처리 — 수신자는 유저.
  'gift.shipped': z.object({
    voucherId: z.string(),
    challengeId: z.string(),
    userId: z.string(),
    giftName: z.string(),
    trackingInfo: z.string().optional(),
  }),
  'order.rejected': z.object({
    orderId: z.string(),
    userId: z.string(),
    challengeId: z.string(),
  }),
  'refund.completed': z.object({
    orderId: z.string(),
    userId: z.string(),
    challengeId: z.string(),
    amount: z.number().int(),
  }),
  'settlement.ready': z.object({
    challengeId: z.string(),
    creatorId: z.string(),
    payoutAmount: z.number().int(),
  }),
  'settlement.paid': z.object({
    settlementId: z.string(),
    creatorId: z.string(),
    amount: z.number().int(),
  }),
  'shipment.updated': z.object({
    shipmentId: z.string(),
    userId: z.string(),
    status: z.string(),
  }),
} as const;

export type DomainEventType = keyof typeof domainEventSchemas;

export type DomainEventDetail<T extends DomainEventType> = z.infer<
  (typeof domainEventSchemas)[T]
>;

export interface DomainEvent<T extends DomainEventType = DomainEventType> {
  type: T;
  source: string;
  detail: DomainEventDetail<T>;
  occurredAt: string;
}
