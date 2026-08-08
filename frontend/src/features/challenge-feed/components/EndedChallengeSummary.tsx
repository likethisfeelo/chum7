import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { commerceApi } from '@/features/commerce/api/commerceApi';
import { useRecapStore } from '@/features/challenge/recapStore';

/**
 * 종료된 챌린지 — 참여자용 결과 배너 + 내 보상 카드 + 다음 동선.
 * 리더가 운영탭에서 돌리는 보상 파이프라인(추첨·선물)의 "받는 쪽 창구".
 */

const VOUCHER_STATUS_LABEL: Record<string, string> = {
  issued: '교환 가능',
  claimed: '교환 신청됨',
  shipped: '배송 중',
  delivered: '수령 완료',
  expired: '만료됨',
};

export function EndedChallengeSummary({
  userChallenge,
  challengeId,
  leaderHandle,
}: {
  userChallenge: any;
  challengeId: string;
  leaderHandle?: string | null;
}) {
  const navigate = useNavigate();
  const openRecap = useRecapStore((s) => s.openRecap);

  const durationDays = Number(userChallenge?.durationDays || userChallenge?.challenge?.durationDays || 0);
  const completedDays = Number(userChallenge?.completedDays ?? 0);
  const isCompleted =
    userChallenge?.status === 'completed' ||
    userChallenge?.phase === 'completed' ||
    (durationDays > 0 && completedDays >= durationDays);

  // 내 보상 — 추첨 당첨(challenge-api) + 선물 교환권(commerce)
  const { data: rewards } = useQuery({
    queryKey: ['my-rewards', challengeId],
    retry: false,
    queryFn: async () => {
      const res = await apiClient.get(`/c/challenges/${challengeId}/my-rewards`);
      return res.data.data as { isCompleted: boolean; drawWins: { drawId: string; title: string | null; createdAt: string | null }[] };
    },
  });
  const { data: voucherData } = useQuery({
    queryKey: ['my-vouchers'],
    queryFn: () => commerceApi.getMyVouchers(),
  });

  const myVouchers = (voucherData?.vouchers ?? []).filter((v) => v.challengeId === challengeId);
  const drawWins = rewards?.drawWins ?? [];
  const hasRewards = drawWins.length > 0 || myVouchers.length > 0;

  return (
    <div className="space-y-3 mb-4">
      {/* 결과 배너 */}
      <div
        className={`rounded-2xl p-5 ${
          isCompleted
            ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200'
            : 'bg-gradient-to-br from-gray-50 to-slate-50 border border-gray-200'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-gray-900">
              {isCompleted ? '🏁 완주했어요!' : '🏁 챌린지가 끝났어요'}
            </p>
            <p className="text-sm text-gray-600 mt-0.5">
              {durationDays > 0 ? `${completedDays}/${durationDays}일 함께했어요` : '함께해줘서 고마워요'}
              {!isCompleted && ' — 충분히 잘했어요'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openRecap(userChallenge)}
            className="flex-shrink-0 px-3.5 py-2 rounded-full bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:border-primary-300 transition-colors"
          >
            나의 리캡 보기
          </button>
        </div>
        <p className="mt-2.5 text-[11px] text-gray-400">종료된 챌린지예요. 기록은 계속 볼 수 있어요.</p>
      </div>

      {/* 내 보상 카드 — 완주자이거나 이미 받은 보상이 있을 때만 */}
      {(isCompleted || hasRewards) && (
        <div className="rounded-2xl bg-white border border-amber-100 p-4">
          <p className="text-sm font-bold text-gray-900">🎁 내 보상</p>
          <div className="mt-2 space-y-1.5">
            {isCompleted && (
              <p className="text-xs text-gray-600">🏅 완주 배지를 획득했어요</p>
            )}
            {drawWins.map((w) => (
              <p key={w.drawId} className="text-xs text-amber-700 font-semibold">
                🏆 추첨 당첨 — {w.title || '완주자 추첨'}
              </p>
            ))}
            {myVouchers.map((v) => (
              <p key={v.voucherId} className="text-xs text-gray-600">
                {v.type === 'physical' ? '📦' : '🎫'} {v.giftName} ·{' '}
                <span className="font-semibold">{VOUCHER_STATUS_LABEL[v.status] ?? v.status}</span>
              </p>
            ))}
            {!hasRewards && isCompleted && (
              <p className="text-xs text-gray-400">리더가 보상을 준비 중이에요. 조금만 기다려주세요!</p>
            )}
          </div>
          {myVouchers.length > 0 && (
            <button
              type="button"
              onClick={() => navigate('/me/gifts')}
              className="mt-2.5 w-full py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors"
            >
              교환권함에서 확인하기 →
            </button>
          )}
        </div>
      )}

      {/* 다음 동선 */}
      <div className="flex gap-2">
        {leaderHandle && (
          <button
            type="button"
            onClick={() => navigate(`/p/@${leaderHandle}`)}
            className="flex-1 py-2.5 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 text-xs font-semibold hover:bg-primary-100 transition-colors"
          >
            이 리더의 다음 챌린지 보기
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/challenges')}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors"
        >
          새 챌린지 찾기
        </button>
      </div>
    </div>
  );
}
