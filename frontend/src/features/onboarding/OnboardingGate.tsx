import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import { getPushSupport } from '@/features/notifications/push';

/**
 * 온보딩 게이트 + 가벼운 방문 넛지 (App 전역 마운트).
 *  - 온보딩 미완료(서버 onboardedAt 없음) 신규 가입자를 /onboarding 으로 보낸다.
 *    · 탭 루트에서만 발동 — 공유/초대 딥링크(/challenges/:id, /preview, /p/... 등)로
 *      들어온 사람은 원래 목적지가 우선이라 가로막지 않는다.
 *    · 기능 출시 이전 가입자는 면제 (LAUNCH_ISO 이전 createdAt)
 *  - iOS 미설치 사용자 3회째 방문 시 홈 화면 추가 넛지 1회 (웹 푸시 전제조건)
 */

const LAUNCH_ISO = '2026-08-09T00:00:00.000Z';
const TAB_ROOTS = ['/', '/me', '/challenges', '/today', '/plaza'];

const VISIT_KEY = 'chum7:visitCount';
const INSTALL_NUDGED_KEY = 'chum7:installNudged';

export function OnboardingGate() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: profile } = useQuery({
    queryKey: ['onboarding-status'],
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await apiClient.get('/u/me');
      return res.data?.data?.user ?? null;
    },
  });

  const needsOnboarding =
    Boolean(profile) &&
    !profile.onboardedAt &&
    typeof profile.createdAt === 'string' &&
    profile.createdAt >= LAUNCH_ISO;

  useEffect(() => {
    if (!needsOnboarding) return;
    if (!TAB_ROOTS.includes(location.pathname)) return; // 딥링크 목적지 우선
    navigate('/onboarding', { replace: true });
  }, [needsOnboarding, location.pathname, navigate]);

  // iOS 홈 화면 추가 넛지 — 세션당 1회 방문 집계, 3회째부터 평생 1회 안내
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      if (sessionStorage.getItem('chum7:visitCounted')) return;
      sessionStorage.setItem('chum7:visitCounted', '1');
      const count = Number(localStorage.getItem(VISIT_KEY) || 0) + 1;
      localStorage.setItem(VISIT_KEY, String(count));
      if (count >= 3 && getPushSupport() === 'needs-install' && !localStorage.getItem(INSTALL_NUDGED_KEY)) {
        localStorage.setItem(INSTALL_NUDGED_KEY, '1');
        toast('📲 홈 화면에 추가하면 응원 알림을 받을 수 있어요\n공유 버튼 → "홈 화면에 추가"', {
          duration: 7000,
        });
      }
    } catch {
      // 스토리지 불가 — 무시
    }
  }, [isAuthenticated]);

  return null;
}
