import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { interestApi, type InterestSubscription } from '@/features/feed/api/interestApi';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';

/**
 * 관심영역 탭 — 마당 게시물 좋아요로 자동 등록된 (리더+카테고리) 구독 목록.
 * 사용자는 알림 on/off, 삭제만 할 수 있다(생성·이름 지정은 자동).
 */
export function InterestAreaTab() {
  const queryClient = useQueryClient();

  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ['interest-subscriptions'],
    queryFn: () => interestApi.list(),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { leaderId: string; category: string; enabled: boolean }) =>
      interestApi.setEnabled(vars.leaderId, vars.category, vars.enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interest-subscriptions'] }),
    onError: () => toast.error('설정 변경에 실패했어요'),
  });

  const removeMutation = useMutation({
    mutationFn: (vars: { leaderId: string; category: string }) =>
      interestApi.remove(vars.leaderId, vars.category),
    onSuccess: () => {
      toast.success('관심영역을 삭제했어요');
      queryClient.invalidateQueries({ queryKey: ['interest-subscriptions'] });
    },
    onError: () => toast.error('삭제에 실패했어요'),
  });

  if (isLoading) return <Loading />;

  if (subscriptions.length === 0) {
    return (
      <EmptyState
        icon="🔔"
        title="관심영역이 없어요"
        description="마당에서 마음에 드는 기록에 좋아요를 누르면, 그 리더의 같은 분야 새 챌린지 모집을 알려드려요."
      />
    );
  }

  return (
    <div className="space-y-2 pb-24">
      <p className="text-[11px] text-gray-400 px-1">
        좋아요한 기록의 리더가 같은 분야로 새 챌린지를 모집하면 알림을 받아요.
      </p>
      {subscriptions.map((sub: InterestSubscription) => (
        <div
          key={`${sub.leaderId}#${sub.category}`}
          className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-100">
                {sub.categoryLabel}
              </span>
              <p className="text-sm font-semibold text-gray-900 truncate">{sub.name}</p>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              공감 {sub.count}회
              {!sub.enabled && ' · 알림 꺼짐'}
            </p>
          </div>

          {/* on/off 토글 */}
          <button
            type="button"
            aria-label="알림 켜기/끄기"
            onClick={() =>
              toggleMutation.mutate({ leaderId: sub.leaderId, category: sub.category, enabled: !sub.enabled })
            }
            disabled={toggleMutation.isPending}
            className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${sub.enabled ? 'bg-primary-500' : 'bg-gray-300'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform ${sub.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>

          {/* 삭제 */}
          <button
            type="button"
            onClick={() => {
              if (window.confirm('이 관심영역을 삭제할까요?')) {
                removeMutation.mutate({ leaderId: sub.leaderId, category: sub.category });
              }
            }}
            disabled={removeMutation.isPending}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
          >
            삭제
          </button>
        </div>
      ))}
    </div>
  );
}
