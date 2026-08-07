import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { BottomSheet } from '@/shared/components/BottomSheet';
import { collectMissedChallenges } from '../utils/remedyStatus';

/**
 * 보완 허브 — ME 헤더 알림 종 옆의 상시 진입점 (⛅ + 개수 뱃지).
 * 여러 챌린지에 보완할 날이 밀려 있어도 바텀시트로 매번 조르지 않고,
 * 여기서 챌린지별 놓친 Day를 한눈에 보고 순서대로 보완하러 간다.
 * 보완할 게 없으면 아예 렌더되지 않는다.
 */
export function RemedyHubButton() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // status=all — 마지막 날을 놓쳐 failed로 확정된 참여도 종료 유예 안에서는 보완 대상
  const { data } = useQuery({
    queryKey: ['my-challenges', 'remedy-prompt'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.get('/c/challenges/my?status=all');
      return response.data.data;
    },
  });

  const missed = collectMissedChallenges(data?.challenges || []);
  if (missed.length === 0) return null;

  const totalDays = missed.reduce((sum, m) => sum + m.missedDays.length, 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`보완할 인증 ${totalDays}개`}
        className="relative w-9 h-9 rounded-full border border-amber-200 bg-amber-50 flex items-center justify-center text-base hover:border-amber-400 transition-colors"
      >
        ⛅
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
          {totalDays}
        </span>
      </button>

      <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="보완할 인증 ⛅">
        <div className="px-6 pb-8">
          <p className="text-xs text-gray-500 mb-3">
            놓친 날을 보완 인증으로 복구할 수 있어요. 하나씩 이어가면 돼요.
          </p>
          <div className="space-y-2">
            {missed.map((m) => (
              <div key={m.userChallengeId} className="rounded-2xl border border-gray-100 bg-white p-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg flex-shrink-0">{m.badgeIcon}</span>
                  <p className="text-sm font-bold text-gray-900 truncate flex-1">{m.title}</p>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">
                    오늘 Day {Math.min(m.todayDay, m.durationDays)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {m.missedDays.map((d) => (
                    <span
                      key={d}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-500 border border-rose-100"
                    >
                      Day {d}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate(
                      `/verification/remedy?userChallengeId=${encodeURIComponent(m.userChallengeId)}&day=${m.missedDays[0]}`,
                    );
                  }}
                  className="mt-2.5 w-full py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors"
                >
                  보완하러 가기 →
                </button>
              </div>
            ))}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
