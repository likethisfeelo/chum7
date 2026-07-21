import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

/**
 * 리더 운영 탭 — 챌린지 수동 시간 제어 카드 (docs/time-policy.md R1·R3).
 * draft → 모집 시작 / recruiting → 모집 마감·조기 시작 / preparing → 조기 시작.
 * 수동 전이는 예약 시각보다 먼저 가능하며, 지나간 예약 시각은 무시된다 (forward-only).
 */

type ControlAction = 'publish' | 'close-recruiting' | 'start';

const LIFECYCLE_META: Record<string, { label: string; badgeClass: string; hint: string }> = {
  draft: {
    label: '작성 중 (비공개)',
    badgeClass: 'bg-gray-100 text-gray-600',
    hint: '아직 공개되지 않았어요. 모집을 시작하면 참여 신청을 받을 수 있어요.',
  },
  recruiting: {
    label: '모집 중',
    badgeClass: 'bg-blue-100 text-blue-700',
    hint: '참여 신청을 받고 있어요. 예약 시각 전에도 모집 마감·조기 시작이 가능해요.',
  },
  preparing: {
    label: '시작 대기',
    badgeClass: 'bg-amber-100 text-amber-700',
    hint: '모집이 마감됐어요. 예정일 전이라도 지금 바로 시작할 수 있어요.',
  },
  active: {
    label: '진행 중',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    hint: '챌린지가 진행 중이에요.',
  },
  completed: {
    label: '종료',
    badgeClass: 'bg-gray-100 text-gray-500',
    hint: '챌린지가 종료됐어요.',
  },
  archived: {
    label: '보관됨',
    badgeClass: 'bg-gray-100 text-gray-500',
    hint: '보관된 챌린지예요.',
  },
};

const ACTION_META: Record<
  ControlAction,
  { label: string; confirmTitle: string; confirmBody: string; confirmLabel: string; buttonClass: string; confirmClass: string }
> = {
  publish: {
    label: '모집 시작하기',
    confirmTitle: '지금 모집을 시작할까요?',
    confirmBody:
      '즉시 챌린지가 공개되어 참여 신청을 받기 시작해요. 예약된 모집 오픈 시각 전이라도 시작할 수 있으며, 지나간 예약 시각은 무시됩니다.',
    confirmLabel: '모집 시작',
    buttonClass: 'bg-primary-500 hover:bg-primary-600',
    confirmClass: 'bg-primary-500',
  },
  'close-recruiting': {
    label: '모집 마감하기',
    confirmTitle: '지금 모집을 마감할까요?',
    confirmBody:
      '즉시 모집이 마감되어 신규 참여 신청을 받을 수 없어요. 예약된 마감 시각이 남아 있어도 무시되며, 되돌릴 수 없습니다.',
    confirmLabel: '모집 마감',
    buttonClass: 'bg-rose-500 hover:bg-rose-600',
    confirmClass: 'bg-rose-500',
  },
  start: {
    label: '지금 시작하기',
    confirmTitle: '챌린지를 지금 시작할까요?',
    confirmBody:
      '시작하면 오늘이 Day 1이 되고 예약된 시작 시각은 무시됩니다. Day 계산과 완주 판정도 오늘 기준으로 다시 계산돼요. 승인된 참여자는 즉시 활성화되고, 승인 대기 중인 신청은 자동 거절됩니다.',
    confirmLabel: '지금 시작',
    buttonClass: 'bg-emerald-500 hover:bg-emerald-600',
    confirmClass: 'bg-emerald-500',
  },
};

const ACTIONS_BY_LIFECYCLE: Record<string, ControlAction[]> = {
  draft: ['publish'],
  recruiting: ['close-recruiting', 'start'],
  preparing: ['start'],
};

export function ChallengeControlCard({ challengeId }: { challengeId: string }) {
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<ControlAction | null>(null);

  // 피드 페이지의 챌린지 쿼리와 같은 키/엔드포인트 — 캐시를 공유한다
  const { data: challenge, isLoading } = useQuery({
    queryKey: ['challenge-feed', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(`/public/challenges/${challengeId}`);
      return response.data?.data;
    },
  });

  const controlMutation = useMutation({
    mutationFn: async (action: ControlAction) => {
      if (action === 'publish') {
        return (await apiClient.patch(`/c/challenges/${challengeId}/publish`)).data;
      }
      if (action === 'close-recruiting') {
        return (await apiClient.post(`/c/challenges/${challengeId}/close-recruiting`)).data;
      }
      return (await apiClient.post(`/c/challenges/${challengeId}/start`)).data;
    },
    onSuccess: (res: any) => {
      toast.success(res?.message || '처리가 완료됐어요');
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ['challenge-feed', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challenge-feed-my-challenges', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
      queryClient.invalidateQueries({ queryKey: ['my-created-challenges'] });
      queryClient.invalidateQueries({ queryKey: ['leader-briefing', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['leader-participants', challengeId] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '처리에 실패했어요. 잠시 후 다시 시도해주세요.');
      setConfirmAction(null);
    },
  });

  // 표시는 effectiveLifecycle 우선 (워커 전이 지연 흡수 — time-policy R4)
  const status = String(challenge?.effectiveLifecycle || challenge?.lifecycle || '');
  const statusMeta = LIFECYCLE_META[status] ?? {
    label: status || '알 수 없음',
    badgeClass: 'bg-gray-100 text-gray-500',
    hint: '상태를 불러오지 못했어요.',
  };
  const actions = ACTIONS_BY_LIFECYCLE[status] ?? [];
  const confirmMeta = confirmAction ? ACTION_META[confirmAction] : null;

  return (
    <section className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900">⏱ 챌린지 제어</h3>
        {!isLoading && (
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusMeta.badgeClass}`}>
            {statusMeta.label}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">상태를 불러오는 중...</p>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-4">{statusMeta.hint}</p>

          {actions.length > 0 ? (
            <div className="flex flex-col sm:flex-row gap-2">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => setConfirmAction(action)}
                  disabled={controlMutation.isPending}
                  className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors ${ACTION_META[action].buttonClass}`}
                >
                  {ACTION_META[action].label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 bg-gray-50/70 rounded-xl px-3 py-2.5">
              지금 단계에서는 수동으로 제어할 수 있는 동작이 없어요.
            </p>
          )}
        </>
      )}

      {/* 확인 모달 */}
      {confirmMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-2">{confirmMeta.confirmTitle}</h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">{confirmMeta.confirmBody}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={controlMutation.isPending}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => controlMutation.mutate(confirmAction!)}
                disabled={controlMutation.isPending}
                className={`flex-1 py-2.5 rounded-xl text-white font-medium text-sm disabled:opacity-50 ${confirmMeta.confirmClass}`}
              >
                {controlMutation.isPending ? '처리 중...' : confirmMeta.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
