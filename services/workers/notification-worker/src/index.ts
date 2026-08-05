import type { EventBridgeEvent } from 'aws-lambda';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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

/**
 * 라우팅 결과. `type`/`title`/`message`(=body)는 프론트 NotificationsPage가
 * 직접 읽는 필드다 — 워커가 채우지 않으면 목록이 아이콘·제목 없이 렌더된다.
 */
interface RoutedNotification {
  recipientId: string;
  category: string;
  type: string; // 프론트 NOTIFICATION_TYPE_META 키
  title: string;
  message: string; // 본문(body)
}

/** 이벤트 유형 → 알림 수신자·카테고리·문구 라우팅 룰 */
function routeNotification(
  type: DomainEventType,
  detail: Record<string, unknown>,
): RoutedNotification | null {
  switch (type) {
    case 'cheer.delivered': {
      const identityKeyword =
        typeof detail.identityKeyword === 'string' ? detail.identityKeyword.trim() : '';
      return {
        recipientId: String(detail.receiverId),
        category: 'cheer',
        type: 'cheer_received',
        title: '응원이 도착했어요 🎉',
        message: identityKeyword
          ? `목표 시간보다 먼저 완료한 동료가 응원을 보냈어요. 당신은 ${identityKeyword} 사람이에요 — 오늘도 완료해봐요!`
          : '응원이 도착했어요! 오늘의 실천을 시작해보세요 🎉',
      };
    }
    case 'comment.created':
      return {
        recipientId: String(detail.targetOwnerId),
        category: 'social',
        type: 'social_comment',
        title: '새 댓글',
        message: '내 게시물에 새 댓글이 달렸어요',
      };
    case 'reaction.created':
      return {
        recipientId: String(detail.targetOwnerId),
        category: 'social',
        type: 'social_reaction',
        title: '새 반응',
        message: '내 게시물에 새 반응이 있어요',
      };
    case 'follow.requested':
      return {
        recipientId: String(detail.followeeId),
        category: 'social',
        type: 'feed_follow_request',
        title: '팔로우 요청',
        message: '새 팔로우 요청이 있어요',
      };
    case 'follow.accepted':
      return {
        recipientId: String(detail.followerId),
        category: 'social',
        type: 'feed_follow_accepted',
        title: '팔로우 수락',
        message: '팔로우 요청이 수락되었어요',
      };
    case 'friend.requested':
      return {
        recipientId: String(detail.targetUserId),
        category: 'social',
        type: 'friend_request',
        title: '새 친구 요청',
        message: '새 친구 요청이 있어요',
      };
    case 'friend.accepted':
      return {
        recipientId: String(detail.requesterId),
        category: 'social',
        type: 'friend_accepted',
        title: '친구 수락',
        message: '친구 요청이 수락되었어요',
      };
    case 'feed.invite_link_used':
      return {
        recipientId: String(detail.ownerId),
        category: 'social',
        type: 'feed_invite_link_used',
        title: '초대 링크 사용',
        message: '초대 링크로 새 이웃이 들어왔어요',
      };
    case 'order.paid':
      return {
        recipientId: String(detail.userId),
        category: 'commerce',
        type: 'order_paid',
        title: '결제 확인',
        message: '결제가 확인되었어요! 이제 챌린지에 참여할 수 있어요 🎉',
      };
    case 'refund.completed':
      return {
        recipientId: String(detail.userId),
        category: 'commerce',
        type: 'refund_completed',
        title: '보증금 반환',
        message: '완주 축하해요! 보증금 반환이 완료되었어요 💰',
      };
    case 'settlement.ready':
      return {
        recipientId: String(detail.creatorId),
        category: 'commerce',
        type: 'settlement_ready',
        title: '정산서 도착',
        message: '챌린지 정산서가 도착했어요. 확인 후 지급이 진행됩니다',
      };
    case 'order.rejected':
      return {
        recipientId: String(detail.userId),
        category: 'commerce',
        type: 'order_rejected',
        title: '입금 확인 실패',
        message: '입금 확인에 실패했어요. 주문 내역을 확인해주세요',
      };
    case 'shipment.updated':
      return {
        recipientId: String(detail.userId),
        category: 'commerce',
        type: 'shipment_updated',
        title: '배송 상태 변경',
        message: '리워드 배송 상태가 변경되었어요',
      };
    case 'proposal.rerejected': {
      const reason = typeof detail.reason === 'string' && detail.reason.trim() ? detail.reason.trim() : '';
      const consequence =
        detail.fallback === 'block'
          ? '시작 전까지 다시 제출하지 않으면 이 챌린지 참여가 제한돼요.'
          : '시작 전까지 다시 제출하지 않으면 기존 제출본으로 진행돼요.';
      return {
        recipientId: String(detail.userId),
        category: 'challenge',
        type: 'personal_quest_rerejected',
        title: '개인 퀘스트가 반려됐어요',
        message: `${reason ? `사유: ${reason} · ` : ''}시작 전까지 다시 제출하면 자동 승인돼요. ${consequence}`,
      };
    }
    case 'proposal.enforced':
      return {
        recipientId: String(detail.userId),
        category: 'challenge',
        type: 'personal_quest_enforced',
        title: detail.outcome === 'blocked' ? '챌린지 참여가 제한됐어요' : '개인 퀘스트가 재승인됐어요',
        message:
          detail.outcome === 'blocked'
            ? '개인 퀘스트를 다시 제출하지 않아 이 챌린지 참여가 제한됐어요.'
            : '개인 퀘스트를 다시 제출하지 않아 기존 제출본으로 진행돼요.',
      };
    case 'ticket.granted': {
      const ticketChalTitle = typeof detail.challengeTitle === 'string' && detail.challengeTitle.trim() ? detail.challengeTitle.trim() : '';
      return {
        recipientId: String(detail.userId),
        category: 'commerce',
        type: 'ticket_granted',
        title: '참여 티켓이 도착했어요 🎫',
        message: ticketChalTitle
          ? `'${ticketChalTitle}' 챌린지 참여 티켓을 받았어요. 티켓으로 바로 참여할 수 있어요!`
          : '챌린지 참여 티켓을 받았어요. 티켓으로 바로 참여할 수 있어요!',
      };
    }
    case 'ticket.requested':
      return {
        recipientId: String(detail.leaderId),
        category: 'commerce',
        type: 'ticket_requested',
        title: '티켓 신청이 도착했어요',
        message: '참여 티켓 신청이 있어요. 운영 탭에서 확인 후 발급해주세요.',
      };
    case 'ticket.request_rejected': {
      const ticketRejectReason = typeof detail.reason === 'string' && detail.reason.trim() ? detail.reason.trim() : '';
      return {
        recipientId: String(detail.userId),
        category: 'commerce',
        type: 'ticket_request_rejected',
        title: '티켓 신청이 반려됐어요',
        message: ticketRejectReason ? `사유: ${ticketRejectReason}` : '티켓 신청이 반려됐어요.',
      };
    }
    case 'challenge.disband_requested':
      return {
        recipientId: String(detail.leaderId),
        category: 'challenge',
        type: 'challenge_disband_requested',
        title: '해산 신청이 접수됐어요',
        message: '유료 챌린지 해산 신청을 접수했어요. 운영자 검토 후 결과를 알려드릴게요.',
      };
    case 'challenge.disband_rejected': {
      const reason = typeof detail.reason === 'string' && detail.reason.trim() ? detail.reason.trim() : '';
      return {
        recipientId: String(detail.leaderId),
        category: 'challenge',
        type: 'challenge_disband_rejected',
        title: '해산 신청이 반려됐어요',
        message: reason ? `사유: ${reason}` : '해산 신청이 반려됐어요. 자세한 내용은 운영자에게 문의해주세요.',
      };
    }
    case 'completion.requested':
      return {
        recipientId: String(detail.leaderId),
        category: 'challenge',
        type: 'completion_requested',
        title: '인증 인정 요청',
        message: `${Number(detail.day) || ''}일차 인증을 인정해달라는 요청이 도착했어요`,
      };
    case 'verification.self_cancelled':
      return {
        recipientId: String(detail.leaderId),
        category: 'challenge',
        type: 'verification_self_cancelled',
        title: '참여자가 인증을 취소했어요',
        message: `${Number(detail.day) || ''}일차 인증 하나가 취소돼 해당 일자 점수가 빠졌어요`,
      };
    case 'completion.resolved':
      return {
        recipientId: String(detail.userId),
        category: 'challenge',
        type: 'completion_resolved',
        title: detail.outcome === 'granted' ? '인증이 인정됐어요' : '인정 요청이 반려됐어요',
        message:
          detail.outcome === 'granted'
            ? `${Number(detail.day) || ''}일차 인증이 완료로 인정됐어요 (+1점)`
            : `${Number(detail.day) || ''}일차 인정 요청이 반려됐어요`,
      };
    default:
      return null; // challenge.completed 등은 다중 수신자 — Phase 4에서 확장
  }
}

/**
 * 이벤트 → 프론트 딥링크. 탭하면 관련 화면으로 이동한다(NotificationsPage.handleClick).
 * 대상 식별자가 detail에 없으면 링크를 생략(목록에서 화살표 미표시).
 */
function buildDeepLink(type: DomainEventType, detail: Record<string, unknown>): string | undefined {
  switch (type) {
    case 'friend.requested':
    case 'friend.accepted':
      return '/friends';
    case 'cheer.delivered':
      return '/today';
    case 'comment.created':
    case 'reaction.created': {
      const targetType = String(detail.targetType ?? '');
      if (targetType === 'plaza') return '/plaza';
      if (targetType === 'board' && detail.targetId) return `/challenge-board/${detail.targetId}`;
      if (targetType === 'verification' && detail.challengeId) return `/challenge-feed/${detail.challengeId}`;
      return undefined;
    }
    case 'follow.requested':
      return detail.followerId ? `/personal-feed/${detail.followerId}` : undefined;
    case 'follow.accepted':
      return detail.followeeId ? `/personal-feed/${detail.followeeId}` : undefined;
    case 'feed.invite_link_used':
      return '/my';
    case 'completion.requested':
    case 'completion.resolved':
    case 'verification.self_cancelled':
      return detail.challengeId ? `/challenge-feed/${detail.challengeId}` : undefined;
    case 'challenge.disbanded':
      return detail.challengeId ? `/challenge-feed/${detail.challengeId}` : undefined;
    case 'challenge.disband_requested':
    case 'challenge.disband_rejected':
      return detail.challengeId ? `/challenges/${detail.challengeId}` : undefined;
    case 'ticket.granted':
    case 'ticket.request_rejected':
      return detail.challengeId ? `/challenges/${detail.challengeId}` : undefined;
    case 'ticket.requested':
      return detail.challengeId ? `/challenge-feed/${detail.challengeId}?tab=ops` : undefined;
    default:
      return undefined;
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

/**
 * 관심영역(리더+카테고리) 구독자 조회 — social 테이블
 *   pk=`INTSUB#LEADER#<leaderId>#CAT#<category>` begins_with(sk,'USER#')
 * SOCIAL_TABLE 미설정 시 빈 배열(안전 폴백).
 */
async function listInterestSubscribers(
  leaderId: string,
  category: string,
): Promise<Array<{ userId: string; enabled: boolean }>> {
  if (!process.env.SOCIAL_TABLE || !leaderId || !category) return [];
  const out: Array<{ userId: string; enabled: boolean }> = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName('SOCIAL_TABLE'),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :u)',
        ExpressionAttributeValues: {
          ':pk': `INTSUB#LEADER#${leaderId}#CAT#${category}`,
          ':u': 'USER#',
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of res.Items ?? []) {
      if (item.userId) out.push({ userId: String(item.userId), enabled: item.enabled !== false });
    }
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return out;
}

/** 단일 수신자에게 인앱 기록 + Web Push 발송 (푸시 실패는 인앱에 영향 없음). */
async function deliverToRecipient(input: {
  routed: RoutedNotification;
  eventType: DomainEventType;
  detail: Record<string, unknown>;
  deepLink?: string;
  now: string;
  notificationId: string;
  friendActorName?: string | null;
}): Promise<void> {
  const { routed, eventType, detail, deepLink, now, notificationId, friendActorName } = input;
  await docClient.send(
    new PutCommand({
      TableName: tableName('USERS_TABLE'),
      Item: {
        pk: `USER#${routed.recipientId}`,
        sk: `NOTIF#${notificationId}`,
        notificationId,
        type: routed.type,
        title: routed.title,
        body: routed.message,
        ...(deepLink ? { deepLink } : {}),
        category: routed.category,
        eventType,
        message: routed.message, // 하위호환(레거시 표면)
        detail,
        ...(friendActorName ? { friendActorName } : {}),
        isRead: false,
        createdAt: now,
      },
    }),
  );
  console.log(
    JSON.stringify({ level: 'info', message: 'notification recorded', type: eventType, recipientId: routed.recipientId }),
  );

  try {
    const nowDate = new Date(now);
    const settings = await loadNotificationSettings(routed.recipientId);
    const decision = decidePush({ category: routed.category, settings, now: nowDate });
    if (!decision.send) {
      console.log(JSON.stringify({ level: 'info', message: 'push suppressed', type: eventType, reason: decision.reason }));
      return;
    }
    const recent = await loadRecentNotifications(routed.recipientId, `NOTIF#${notificationId}`).catch(() => []);
    if (isPushRateLimited({ category: routed.category, recent, now: nowDate })) {
      console.log(JSON.stringify({ level: 'info', message: 'push rate-limited', type: eventType, recipientId: routed.recipientId }));
      return;
    }
    const bundle = decideBundle({
      category: routed.category,
      eventType,
      message: routed.message,
      detail,
      recent,
      now: nowDate,
    });
    await sendPushToUser(routed.recipientId, {
      ...buildPushPayload({ message: routed.message, category: routed.category, eventType }),
      body: bundle.body,
      tag: bundle.tag,
      ...(bundle.renotify !== undefined ? { renotify: bundle.renotify } : {}),
    });
  } catch (err) {
    console.log(JSON.stringify({ level: 'warn', message: 'push pipeline failed', type: eventType, error: (err as Error).message }));
  }
}

/** 관심영역 모집 알림 팬아웃 — (리더+카테고리) 구독자 전체에게 발송. */
async function fanOutChallengeRecruiting(
  event: EventBridgeEvent<string, Record<string, unknown>>,
  now: string,
): Promise<void> {
  const detail = event.detail;
  const leaderId = String(detail.leaderId ?? '');
  const category = String(detail.category ?? '');
  const title = String(detail.title ?? '');
  const challengeId = String(detail.challengeId ?? '');
  const subscribers = await listInterestSubscribers(leaderId, category);
  const enabled = subscribers.filter((s) => s.enabled && s.userId !== leaderId);
  console.log(JSON.stringify({ level: 'info', message: 'interest fan-out', leaderId, category, total: subscribers.length, enabled: enabled.length }));

  const deepLink = challengeId ? `/challenges/${challengeId}` : undefined;
  const message = title
    ? `관심 리더가 '${title}' 챌린지 모집을 시작했어요`
    : '관심 리더가 새 챌린지 모집을 시작했어요';

  for (const sub of enabled) {
    await deliverToRecipient({
      routed: {
        recipientId: sub.userId,
        category: 'interest_area',
        type: 'challenge_recruiting',
        title: '관심 리더의 새 챌린지',
        message,
      },
      eventType: 'challenge.recruiting',
      detail,
      deepLink,
      now,
      // 수신자별 고유 NOTIF 키 (같은 이벤트라도 파티션이 다르지만 안전하게 분리)
      notificationId: `${now}#${event.id}#${sub.userId}`,
    });
  }
}

/** 챌린지 해산 알림 팬아웃 — 리더 제외 참여 멤버 전원에게 발송. */
async function fanOutChallengeDisbanded(
  event: EventBridgeEvent<string, Record<string, unknown>>,
  now: string,
): Promise<void> {
  const detail = event.detail;
  const leaderId = String(detail.leaderId ?? '');
  const challengeId = String(detail.challengeId ?? '');
  const title = typeof detail.title === 'string' ? detail.title.trim() : '';
  const memberIds = Array.isArray(detail.memberIds) ? detail.memberIds.map((id) => String(id)) : [];
  const recipients = [...new Set(memberIds)].filter((id) => id && id !== leaderId);
  console.log(JSON.stringify({ level: 'info', message: 'disband fan-out', challengeId, recipients: recipients.length }));

  const deepLink = challengeId ? `/challenge-feed/${challengeId}` : undefined;
  const message = title
    ? `리더가 '${title}' 챌린지를 해산했어요. 그동안의 기록은 완료 탭에서 볼 수 있어요.`
    : '리더가 챌린지를 해산했어요. 그동안의 기록은 완료 탭에서 볼 수 있어요.';

  for (const recipientId of recipients) {
    await deliverToRecipient({
      routed: {
        recipientId,
        category: 'challenge',
        type: 'challenge_disbanded',
        title: '챌린지가 해산됐어요',
        message,
      },
      eventType: 'challenge.disbanded',
      detail,
      deepLink,
      now,
      notificationId: `${now}#${event.id}#${recipientId}`,
    });
  }
}

export const handler = async (
  event: EventBridgeEvent<string, Record<string, unknown>>,
): Promise<void> => {
  const type = event['detail-type'] as DomainEventType;
  const now = new Date().toISOString();

  // 다중 수신자 팬아웃 — 관심영역 구독자 알림
  if (type === 'challenge.recruiting') {
    await fanOutChallengeRecruiting(event, now);
    return;
  }

  // 다중 수신자 팬아웃 — 챌린지 해산 알림 (참여 멤버 전원)
  if (type === 'challenge.disbanded') {
    await fanOutChallengeDisbanded(event, now);
    return;
  }

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
      routed.title = `친구 ${friendActorName}님`;
      routed.message =
        type === 'comment.created'
          ? `친구 ${friendActorName}님이 내 게시물에 댓글을 남겼어요`
          : `친구 ${friendActorName}님이 내 게시물에 반응했어요`;
    }
  }

  await deliverToRecipient({
    routed,
    eventType: type,
    detail: event.detail,
    deepLink: buildDeepLink(type, event.detail),
    now,
    notificationId: `${now}#${event.id}`,
    friendActorName,
  });
};
