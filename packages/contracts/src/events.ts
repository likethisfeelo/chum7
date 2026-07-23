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
  'comment.created': z.object({
    targetType: z.enum(['plaza', 'board', 'verification', 'bulletin', 'personal']),
    targetId: z.string(),
    targetOwnerId: z.string(),
    authorId: z.string(),
    commentId: z.string(),
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
  'order.paid': z.object({
    orderId: z.string(),
    userId: z.string(),
    challengeId: z.string(),
    amount: z.number().int(),
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
