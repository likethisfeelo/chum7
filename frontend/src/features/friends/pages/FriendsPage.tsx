import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  acceptFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  fetchRecommendations,
  removeFriend,
  sendFriendRequest,
} from '../api/friendsApi';

const LEVEL_LABEL: Record<string, string> = {
  frequent: '자주 마주쳤어요',
  regular: '종종 마주쳤어요',
  occasional: '가끔 마주쳤어요',
};

export const FriendsPage = () => {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['friend-recommendations'] });
    qc.invalidateQueries({ queryKey: ['friend-requests'] });
    qc.invalidateQueries({ queryKey: ['friends'] });
  };

  const recs = useQuery({ queryKey: ['friend-recommendations'], queryFn: fetchRecommendations });
  const requests = useQuery({ queryKey: ['friend-requests'], queryFn: fetchFriendRequests });
  const friends = useQuery({ queryKey: ['friends'], queryFn: fetchFriends });

  const requestM = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => { toast.success('친구 요청을 보냈어요'); invalidate(); },
    onError: () => toast.error('요청에 실패했어요'),
  });
  const acceptM = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: () => { toast.success('친구가 되었어요'); invalidate(); },
    onError: () => toast.error('수락에 실패했어요'),
  });
  const removeM = useMutation({
    mutationFn: removeFriend,
    onSuccess: () => { toast.success('삭제했어요'); invalidate(); },
    onError: () => toast.error('삭제에 실패했어요'),
  });

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">친구</h1>

      {/* 받은 요청 */}
      {(requests.data?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500">받은 요청</h2>
          {requests.data!.map((r) => (
            <div key={r.fromUserId} className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-3">
              <span className="font-medium text-gray-800">{r.displayName}</span>
              <button
                onClick={() => acceptM.mutate(r.fromUserId)}
                disabled={acceptM.isPending}
                className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                수락
              </button>
            </div>
          ))}
        </section>
      )}

      {/* 추천 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500">알 수도 있는 이웃</h2>
        {recs.isLoading ? (
          <p className="text-sm text-gray-400">불러오는 중…</p>
        ) : (recs.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-400">아직 추천할 이웃이 없어요. 챌린지·마당에서 활동해보세요.</p>
        ) : (
          recs.data!.map((rec) => (
            <div key={rec.user.userId} className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-800 truncate">{rec.user.displayName}</p>
                <p className="text-xs text-gray-500">
                  {LEVEL_LABEL[rec.reason.interactionLevel] ?? '마주쳤어요'}
                  {rec.reason.sharedChallenges > 0 && ` · 함께한 챌린지 ${rec.reason.sharedChallenges}개`}
                </p>
              </div>
              <button
                onClick={() => requestM.mutate(rec.user.userId)}
                disabled={requestM.isPending}
                className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                친구 요청
              </button>
            </div>
          ))
        )}
      </section>

      {/* 내 친구 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500">내 친구</h2>
        {(friends.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-400">아직 친구가 없어요.</p>
        ) : (
          friends.data!.map((f) => (
            <div key={f.userId} className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-3">
              <Link to={`/friends/${f.userId}`} className="font-medium text-gray-800 hover:text-primary-600">
                {f.displayName}
              </Link>
              <button
                onClick={() => { if (window.confirm('친구를 삭제할까요?')) removeM.mutate(f.userId); }}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                삭제
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
};
