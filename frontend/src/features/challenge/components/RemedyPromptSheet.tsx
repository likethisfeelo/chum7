import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { BottomSheet } from '@/shared/components/BottomSheet';
import { useAuthStore } from '@/stores/authStore';
import { useRecapStore } from '../recapStore';
import {
  getProgressEntryByDay,
  isCompletedVerificationStatus,
  resolveChallengeDay,
  resolveChallengeDurationDays,
} from '../utils/challengeLifecycle';
import { getRemainingRemedyCount, getRemedyType } from '../utils/flowPolicy';

/**
 * 보완인증 유도 바텀시트 — 어제 인증을 빼먹은 활성 챌린지가 있으면
 * "어제 빠졌군요, 보완인증으로 완주 기회를 이어갈 수 있어요!"를 자동 노출.
 *  - 해당 날짜가 인증/보완 완료되면 조건에서 빠져 더 이상 뜨지 않는다
 *  - 같은 (참여, 날짜)에 대해 최대 2회만 노출 (localStorage remedyPrompt: 카운트,
 *    로그아웃 시에도 보존 — lib/auth-storage.ts)
 *  - 종료 리캡 시트와 겹치지 않게 리캡이 닫힌 뒤에만 연다
 */

const PROMPT_PREFIX = 'remedyPrompt:';
const MAX_SHOWS = 2;

const promptKey = (userChallengeId: string, day: number) => `${PROMPT_PREFIX}${userChallengeId}:${day}`;

function shownCount(userChallengeId: string, day: number): number {
  try {
    return Number(localStorage.getItem(promptKey(userChallengeId, day)) || 0);
  } catch {
    return MAX_SHOWS; // 스토리지 불가 → 자동 노출 스킵(안전)
  }
}

function markShown(userChallengeId: string, day: number): void {
  try {
    localStorage.setItem(promptKey(userChallengeId, day), String(shownCount(userChallengeId, day) + 1));
  } catch {
    // 무시
  }
}

interface MissedCandidate {
  userChallengeId: string;
  challengeId: string;
  title: string;
  badgeIcon: string;
  missedDay: number;
  currentDay: number;
  durationDays: number;
}

function findMissedYesterday(items: any[]): MissedCandidate | null {
  for (const item of items || []) {
    if (String(item?.status) !== 'active') continue;
    const durationDays = resolveChallengeDurationDays(item);
    const currentDay = resolveChallengeDay(item);
    const missedDay = currentDay - 1;
    if (missedDay < 1 || missedDay > durationDays) continue;

    // 어제가 이미 인증/보완 완료면 스킵
    const entry = getProgressEntryByDay(item?.progress, missedDay);
    if (isCompletedVerificationStatus(entry?.status) || entry?.remedied === true) continue;

    // 보완이 실제로 가능한 챌린지만 — disabled 제외, last_day는 보완 전용일에만
    const remedyType = getRemedyType(item?.remedyPolicy);
    if (remedyType === 'disabled') continue;
    if (remedyType === 'last_day' && currentDay < durationDays) continue;
    const remaining = getRemainingRemedyCount(item?.remedyPolicy, item?.progress || []);
    if (remaining !== null && remaining <= 0) continue;

    if (shownCount(String(item.userChallengeId), missedDay) >= MAX_SHOWS) continue;

    return {
      userChallengeId: String(item.userChallengeId),
      challengeId: String(item.challengeId),
      title: String(item?.challenge?.title || '챌린지'),
      badgeIcon: String(item?.challenge?.badgeIcon || '🎯'),
      missedDay,
      currentDay,
      durationDays,
    };
  }
  return null;
}

export function RemedyPromptSheet() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const recapOpen = useRecapStore((s) => s.isOpen);
  const [candidate, setCandidate] = useState<MissedCandidate | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery({
    queryKey: ['my-challenges', 'remedy-prompt'],
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.get('/c/challenges/my?status=active');
      return response.data.data;
    },
  });

  const missed = useMemo(() => findMissedYesterday(data?.challenges || []), [data]);

  // 리캡 시트가 떠 있으면 양보 — 닫힌 뒤(또는 처음부터 없음)에 1회 오픈 + 노출 카운트
  useEffect(() => {
    if (dismissed || candidate || recapOpen || !missed) return;
    markShown(missed.userChallengeId, missed.missedDay);
    setCandidate(missed);
  }, [missed, recapOpen, candidate, dismissed]);

  const close = () => {
    setCandidate(null);
    setDismissed(true); // 이번 세션에서는 다시 열지 않음
  };

  if (!candidate) return null;

  return (
    <BottomSheet isOpen onClose={close}>
      <div className="px-6 pb-8 text-center">
        <div className="text-5xl leading-none">🌧️→☀️</div>
        <h2 className="mt-3 text-xl font-extrabold text-gray-900">어제 하루 빠졌군요!</h2>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          {candidate.badgeIcon} <b>{candidate.title}</b>의 Day {candidate.missedDay} 인증을 놓쳤어요.
          <br />
          <b>보완 인증</b>으로 완주 기회를 이어갈 수 있어요!
        </p>
        <p className="mt-2 text-[11px] text-gray-400">
          오늘 Day {candidate.currentDay} / 총 {candidate.durationDays}일
        </p>

        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={() => {
              close();
              navigate(
                `/verification/remedy?userChallengeId=${encodeURIComponent(candidate.userChallengeId)}&day=${candidate.missedDay}`,
              );
            }}
            className="w-full py-3.5 rounded-2xl bg-primary-600 text-white font-bold text-sm"
          >
            지금 보완 인증하기 💪
          </button>
          <button
            type="button"
            onClick={close}
            className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 font-medium text-sm"
          >
            다음에 할게요
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
