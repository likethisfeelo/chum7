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
  }),
  'follow.requested': z.object({
    followerId: z.string(),
    followeeId: z.string(),
  }),
  'order.paid': z.object({
    orderId: z.string(),
    userId: z.string(),
    challengeId: z.string(),
    amount: z.number().int(),
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
