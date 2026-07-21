import type { EventBridgeEvent } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import type { DomainEventType } from '@chum7/contracts';

/**
 * notification-worker — 이벤트 버스의 첫 소비자 (REDESIGN_PLAN §3.2).
 * v1(Phase 1): 도메인 이벤트 → 수신자 인앱 알림 기록.
 * Phase 4에서 수신 설정 확인·Web Push 발송·묶음 발송이 추가된다.
 */

/** 이벤트 유형 → 알림 수신자·카테고리·문구 라우팅 룰 */
function routeNotification(
  type: DomainEventType,
  detail: Record<string, unknown>,
): { recipientId: string; category: string; message: string } | null {
  switch (type) {
    case 'cheer.delivered':
      return {
        recipientId: String(detail.receiverId),
        category: 'cheer',
        message: '응원이 도착했어요! 오늘의 실천을 시작해보세요 🎉',
      };
    case 'comment.created':
      return {
        recipientId: String(detail.targetOwnerId),
        category: 'social',
        message: '내 게시물에 새 댓글이 달렸어요',
      };
    case 'follow.requested':
      return {
        recipientId: String(detail.followeeId),
        category: 'social',
        message: '새 팔로우 요청이 있어요',
      };
    case 'follow.accepted':
      return {
        recipientId: String(detail.followerId),
        category: 'social',
        message: '팔로우 요청이 수락되었어요',
      };
    case 'feed.invite_link_used':
      return {
        recipientId: String(detail.ownerId),
        category: 'social',
        message: '초대 링크로 새 이웃이 들어왔어요',
      };
    case 'order.paid':
      return {
        recipientId: String(detail.userId),
        category: 'commerce',
        message: '결제가 완료되어 챌린지 참여가 확정되었어요',
      };
    case 'shipment.updated':
      return {
        recipientId: String(detail.userId),
        category: 'commerce',
        message: '리워드 배송 상태가 변경되었어요',
      };
    default:
      return null; // challenge.completed 등은 다중 수신자 — Phase 4에서 확장
  }
}

export const handler = async (
  event: EventBridgeEvent<string, Record<string, unknown>>,
): Promise<void> => {
  const type = event['detail-type'] as DomainEventType;
  const routed = routeNotification(type, event.detail);
  if (!routed) {
    console.log(JSON.stringify({ level: 'info', message: 'event ignored', type }));
    return;
  }

  const now = new Date().toISOString();
  const notificationId = `${now}#${event.id}`;
  await docClient.send(
    new PutCommand({
      TableName: tableName('USERS_TABLE'),
      Item: {
        pk: `USER#${routed.recipientId}`,
        sk: `NOTIF#${notificationId}`,
        notificationId,
        category: routed.category,
        eventType: type,
        message: routed.message,
        detail: event.detail,
        isRead: false,
        createdAt: now,
      },
    }),
  );
  console.log(
    JSON.stringify({ level: 'info', message: 'notification recorded', type, recipientId: routed.recipientId }),
  );
};
