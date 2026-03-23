import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loading } from '@/shared/components/Loading';
import { personalFeedApi, FeedNotification } from '../api/personalFeedApi';

const NOTIFICATION_TYPE_META: Record<string, { icon: string; label: string }> = {
  feed_follow_request:      { icon: '👤', label: '팔로우 요청' },
  feed_follow_accepted:     { icon: '✅', label: '팔로우 수락' },
  feed_invite_link_used:    { icon: '🔗', label: '초대 링크 사용' },
  feed_badge_granted:       { icon: '🏅', label: '뱃지 획득' },
  feed_leader_badge_updated:{ icon: '👑', label: '리더 뱃지 갱신' },
  challenge_completed:      { icon: '🎉', label: '챌린지 완주' },
  challenge_failed:         { icon: '😔', label: '챌린지 실패' },
  quest_submission_approved:{ icon: '✨', label: '퀘스트 승인' },
  quest_submission_rejected:{ icon: '❌', label: '퀘스트 반려' },
  cheer_received:           { icon: '📣', label: '응원 수신' },
  join_request_approved:    { icon: '🎊', label: '참가 승인' },
  join_request_rejected:    { icon: '🚫', label: '참가 거절' },
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [includeRead, setIncludeRead] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', includeRead],
    queryFn: () => personalFeedApi.getNotifications(includeRead),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => personalFeedApi.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleClick = (n: FeedNotification) => {
    if (!n.isRead) {
      markReadMutation.mutate(n.notificationId);
    }
    if (n.deepLink) {
      navigate(n.deepLink);
    }
  };

  const notifications = data ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white sticky top-0 z-10 border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            ←
          </button>
          <h1 className="font-bold text-gray-900 flex-1">
            알림
            {unreadCount > 0 && (
              <span className="ml-2 text-xs font-semibold bg-red-500 text-white rounded-full px-1.5 py-0.5">
                {unreadCount}
              </span>
            )}
          </h1>
          <button
            onClick={() => navigate('/notifications/settings')}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            설정
          </button>
        </div>
      </div>

      {/* 읽음 필터 */}
      <div className="flex gap-2 px-4 pt-3 pb-1">
        <button
          onClick={() => setIncludeRead(false)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            !includeRead
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          안 읽음
        </button>
        <button
          onClick={() => setIncludeRead(true)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            includeRead
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          전체
        </button>
      </div>

      {/* 목록 */}
      <div className="px-4 py-2">
        {isLoading ? (
          <Loading />
        ) : notifications.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-3xl mb-3">🔔</p>
            <p className="text-sm">{includeRead ? '알림이 없어요' : '읽지 않은 알림이 없어요'}</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {notifications.map((n) => {
              const meta = NOTIFICATION_TYPE_META[n.type] ?? { icon: '📢', label: n.type };
              return (
                <li key={n.notificationId}>
                  <button
                    onClick={() => handleClick(n)}
                    className={`w-full text-left flex items-start gap-3 px-3 py-3 rounded-xl transition-colors ${
                      n.isRead
                        ? 'bg-white hover:bg-gray-50'
                        : 'bg-primary-50 hover:bg-primary-100'
                    }`}
                  >
                    <span className="text-xl mt-0.5 shrink-0">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-semibold ${n.isRead ? 'text-gray-700' : 'text-gray-900'}`}>
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(n.createdAt)}</p>
                    </div>
                    {n.deepLink && (
                      <span className="text-gray-300 shrink-0 mt-1">›</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
