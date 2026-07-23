import type { EventBridgeEvent } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import type { DomainEventType } from '@chum7/contracts';
import { buildPushPayload, decidePush } from './domain/push-rules';
import { decideBundle, isPushRateLimited } from './domain/bundle-rules';
import { loadNotificationSettings, loadRecentNotifications, sendPushToUser } from './push-sender';

/**
 * notification-worker — 이벤트 버스의 첫 소비자 (REDESIGN_PLAN §3.2).
 * 도메인 이벤트 → 수신자 인앱 알림 기록 + 수신 설정 확인 후 Web Push 발송 (§4.10).
 * 묶음 발송(집계): 최근 미읽음 알림을 조회해 같은 그룹이면 집계 문구 + 안정 태그로
 * 이전 푸시를 교체하고, 윈도우 내 폭주 시 비-cheer 푸시를 억제한다 (§4.10 집계 행).
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
    case 'reaction.created':
      return {
        recipientId: String(detail.targetOwnerId),
        category: 'social',
        message: '내 게시물에 새 반응이 있어요',
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
    case 'friend.requested':
      return {
        recipientId: String(detail.targetUserId),
        category: 'social',
        message: '새 친구 요청이 있어요',
      };
    case 'friend.accepted':
      return {
        recipientId: String(detail.requesterId),
        category: 'social',
        message: '친구 요청이 수락되었어요',
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
        message: '결제가 확인되었어요! 이제 챌린지에 참여할 수 있어요 🎉',
      };
    case 'refund.completed':
      return {
        recipientId: String(detail.userId),
        category: 'commerce',
        message: '완주 축하해요! 보증금 반환이 완료되었어요 💰',
      };
    case 'settlement.ready':
      return {
        recipientId: String(detail.creatorId),
        category: 'commerce',
        message: '챌린지 정산서가 도착했어요. 확인 후 지급이 진행됩니다',
      };
    case 'order.rejected':
      return {
        recipientId: String(detail.userId),
        category: 'commerce',
        message: '입금 확인에 실패했어요. 주문 내역을 확인해주세요',
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

/**
 * 친구 실명 식별 (친구 모델 v2 §3) — actor가 recipient의 수락된 친구면 실명을 반환.
 * 공개 화면은 익명 유지, 알림에서만 "친구 OO님"으로 밝힌다. GRAPH_TABLE 미설정 시 스킵.
 */
async function revealFriendActor(recipientId: string, actorId: string): Promise<string | null> {
  if (!actorId || actorId === recipientId || !process.env.GRAPH_TABLE) return null;
  try {
    const edge = await docClient.send(
      new GetCommand({
        TableName: tableName('GRAPH_TABLE'),
        Key: { pk: `USER#${recipientId}`, sk: `FRIEND#${actorId}` },
      }),
    );
    if (edge.Item?.status !== 'accepted') return null;
    const profile = await docClient.send(
      new GetCommand({ TableName: tableName('USERS_TABLE'), Key: { pk: `USER#${actorId}`, sk: 'PROFILE' } }),
    );
    return (profile.Item?.name as string) || null;
  } catch {
    return null;
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

  // 친구가 익명으로 남긴 반응/댓글이면 알림에서만 실명 식별 (v2 §3)
  let friendActorName: string | null = null;
  if (type === 'comment.created' || type === 'reaction.created') {
    const actorId = String(event.detail.authorId ?? event.detail.actorUserId ?? '');
    friendActorName = await revealFriendActor(routed.recipientId, actorId);
    if (friendActorName) {
      routed.message =
        type === 'comment.created'
          ? `친구 ${friendActorName}님이 내 게시물에 댓글을 남겼어요`
          : `친구 ${friendActorName}님이 내 게시물에 반응했어요`;
    }
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
        ...(friendActorName ? { friendActorName } : {}),
        isRead: false,
        createdAt: now,
      },
    }),
  );
  console.log(
    JSON.stringify({ level: 'info', message: 'notification recorded', type, recipientId: routed.recipientId }),
  );

  // ── Web Push 발송 — 인앱 기록은 이미 완료, 여기서의 실패는 인앱에 영향 없음 ──
  try {
    const nowDate = new Date(now);
    const settings = await loadNotificationSettings(routed.recipientId);
    const decision = decidePush({ category: routed.category, settings, now: nowDate });
    if (!decision.send) {
      console.log(
        JSON.stringify({ level: 'info', message: 'push suppressed', type, reason: decision.reason }),
      );
      return;
    }

    // 묶음 발송·폭주 가드 (§4.10 집계) — 조회 실패 시 단건 발송으로 폴백
    const recent = await loadRecentNotifications(
      routed.recipientId,
      `NOTIF#${notificationId}`,
    ).catch(() => []);
    if (isPushRateLimited({ category: routed.category, recent, now: nowDate })) {
      console.log(
        JSON.stringify({
          level: 'info',
          message: 'push rate-limited',
          type,
          recipientId: routed.recipientId,
        }),
      );
      return;
    }
    const bundle = decideBundle({
      category: routed.category,
      eventType: type,
      message: routed.message,
      detail: event.detail,
      recent,
      now: nowDate,
    });
    await sendPushToUser(routed.recipientId, {
      ...buildPushPayload({ message: routed.message, category: routed.category, eventType: type }),
      body: bundle.body,
      tag: bundle.tag,
      ...(bundle.renotify !== undefined ? { renotify: bundle.renotify } : {}),
    });
  } catch (err) {
    console.log(
      JSON.stringify({
        level: 'warn',
        message: 'push pipeline failed',
        type,
        error: (err as Error).message,
      }),
    );
  }
};
