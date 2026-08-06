import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { characterApi } from '@/features/character/api/characterApi';

import { MainLayout } from '@/shared/layouts/MainLayout';

import { LandingPage } from '@/features/landing/pages/LandingPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { EmailVerificationPage } from '@/features/auth/pages/EmailVerificationPage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { AuthCallbackPage } from '@/features/auth/pages/AuthCallbackPage';
import { ChallengesPage } from '@/features/challenge/pages/ChallengesPage';
import { ChallengeDetailPage } from '@/features/challenge/pages/ChallengeDetailPage';
import { ChallengePreviewPage } from '@/features/challenge/pages/ChallengePreviewPage';
import { RewardProductPage } from '@/features/challenge/pages/RewardProductPage';
import { PublicProfilePage } from '@/features/personal-feed/pages/PublicProfilePage';
import { ChallengeCreatePage } from '@/features/challenge/pages/ChallengeCreatePage';
import { ChallengeEditPage } from '@/features/challenge/pages/ChallengeEditPage';
import { ChallengeFeedPage } from '@/features/challenge-feed/pages/ChallengeFeedPage';
import { DmPage } from '@/features/challenge-chat/pages/DmPage';
import { ChallengeBoardPage } from '@/features/challenge-board/pages/ChallengeBoardPage';
import { MEPage } from '@/features/me/pages/MEPage';
import { MyPage } from '@/features/me/pages/MyPage';
import { MyRecordsPage } from '@/features/me/pages/MyRecordsPage';
import { GiftBoxPage } from '@/features/me/pages/GiftBoxPage';
import { CheerHistoryPage } from '@/features/today/pages/CheerHistoryPage';
import { TodayPage } from '@/features/today/pages/TodayPage';
import { FeedPage } from '@/features/feed/pages/FeedPage';
import { ProfilePage } from '@/features/profile/pages/ProfilePage';
import { FriendsPage } from '@/features/friends/pages/FriendsPage';
import { FriendArchivePage } from '@/features/friends/pages/FriendArchivePage';
import { BadgeCollectionPage } from '@/features/profile/pages/BadgeCollectionPage';
import { RemedyPage } from '@/features/verification/pages/RemedyPage';
import { QuestBoardPage } from '@/features/quest/pages/QuestBoardPage';
import { MyQuestSubmissionsPage } from '@/features/quest/pages/MyQuestSubmissionsPage';
import { PersonalFeedPage } from '@/features/personal-feed/pages/PersonalFeedPage';
import { FeedSettingsPage } from '@/features/personal-feed/pages/FeedSettingsPage';
import { NotificationsPage } from '@/features/personal-feed/pages/NotificationsPage';
import { InviteLandingPage } from '@/features/personal-feed/pages/InviteLandingPage';
import { NotificationSettingsPage } from '@/features/notifications/pages/NotificationSettingsPage';
import { MythologyOnboardingPage } from '@/features/character/pages/MythologyOnboardingPage';
import { CharacterViewerPage } from '@/features/character/pages/CharacterViewerPage';
import { HashtagPage } from '@/features/hashtag/pages/HashtagPage';
import { PushPermissionSheet } from '@/features/notifications/components/PushPermissionSheet';
import { ChallengeRecapSheet } from '@/features/challenge/components/ChallengeRecapSheet';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    // 로그인 후 원래 가려던 곳으로 복귀할 수 있도록 redirect 파라미터 보존 (공유 링크 참여 플로우)
    const target = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${target}`} replace />;
  }
  return <>{children}</>;
};

const PublicOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/me" replace />;
  return <>{children}</>;
};

function ThemeApplier() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data } = useQuery({
    queryKey: ['character', 'status'],
    queryFn: () => characterApi.getStatus(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const theme = data?.themeOverride ?? data?.activeMythology ?? '';
    document.body.setAttribute('data-theme', theme || '');
  }, [data?.themeOverride, data?.activeMythology]);

  return null;
}

// 배포 반영 확인용 빌드 버전 마커 — 화면 좌하단 고정, 터치 방해 없음
const BUILD_VERSION = 'v.0806';

function BuildVersionBadge() {
  return (
    <div
      aria-hidden
      className="fixed bottom-1 left-1 z-[9999] pointer-events-none select-none text-[9px] leading-none text-gray-400/70"
    >
      {BUILD_VERSION}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeApplier />
      <BuildVersionBadge />
      <Routes>
        {/* 공개 라우트 */}
        <Route
          path="/"
          element={
            <PublicOnlyRoute>
              <LandingPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />

        <Route
          path="/verify-email"
          element={
            <PublicOnlyRoute>
              <EmailVerificationPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicOnlyRoute>
              <ForgotPasswordPage />
            </PublicOnlyRoute>
          }
        />
        {/* 소셜 로그인 팝업 복귀 지점 — 리다이렉트 래퍼 없이(팝업 내부에서만 동작) */}
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        {/* 공개 챌린지 미리보기 — 로그인 전에도 열림(공유 링크). 로그인 상태면 상세로 이동 */}
        <Route path="/preview/:challengeId" element={<ChallengePreviewPage />} />
        {/* 공개 프로필(리더 모객 랜딩) — 비로그인 열람 허용, @핸들 주소만 사용 */}
        <Route path="/p/:handle" element={<PublicProfilePage />} />

        {/* 보호된 라우트 (로그인 필요) */}
        <Route
          path="/challenges"
          element={
            <ProtectedRoute>
              <MainLayout>
                <ChallengesPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/challenges/new"
          element={
            <ProtectedRoute>
              <ChallengeCreatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/challenges/:challengeId"
          element={
            <ProtectedRoute>
              <ChallengeDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/challenges/:challengeId/reward"
          element={
            <ProtectedRoute>
              <RewardProductPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/challenges/:challengeId/edit"
          element={
            <ProtectedRoute>
              <ChallengeEditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/challenge-feed/:challengeId"
          element={
            <ProtectedRoute>
              <ChallengeFeedPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/challenge-board/:challengeId"
          element={
            <ProtectedRoute>
              <ChallengeBoardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dm/:challengeId/:participantId"
          element={
            <ProtectedRoute>
              <DmPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/me"
          element={
            <ProtectedRoute>
              <MainLayout>
                <MEPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/me/records"
          element={
            <ProtectedRoute>
              <MyRecordsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/me/gifts"
          element={
            <ProtectedRoute>
              <GiftBoxPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cheers/history"
          element={
            <ProtectedRoute>
              <CheerHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my"
          element={
            <ProtectedRoute>
              <MainLayout>
                <MyPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/today"
          element={
            <ProtectedRoute>
              <MainLayout>
                <TodayPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/plaza"
          element={
            <ProtectedRoute>
              <MainLayout>
                <FeedPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <MainLayout>
                <ProfilePage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/friends"
          element={
            <ProtectedRoute>
              <MainLayout>
                <FriendsPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/friends/:userId"
          element={
            <ProtectedRoute>
              <MainLayout>
                <FriendArchivePage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/badges"
          element={
            <ProtectedRoute>
              <BadgeCollectionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/verification/remedy"
          element={
            <ProtectedRoute>
              <RemedyPage />
            </ProtectedRoute>
          }
        />
        {/* 퀘스트 보드 */}
        <Route
          path="/quests"
          element={
            <ProtectedRoute>
              <QuestBoardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quests/my-submissions"
          element={
            <ProtectedRoute>
              <MyQuestSubmissionsPage />
            </ProtectedRoute>
          }
        />

        {/* 알림 설정 */}
        <Route
          path="/notifications/settings"
          element={
            <ProtectedRoute>
              <NotificationSettingsPage />
            </ProtectedRoute>
          }
        />

        {/* 개인 피드 */}
        <Route
          path="/personal-feed/invite/:token"
          element={
            <ProtectedRoute>
              <InviteLandingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/personal-feed/notifications"
          element={
            <ProtectedRoute>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/personal-feed/settings"
          element={
            <ProtectedRoute>
              <FeedSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/personal-feed/:userId"
          element={
            <ProtectedRoute>
              <PersonalFeedPage />
            </ProtectedRoute>
          }
        />

        {/* 캐릭터 */}
        <Route
          path="/character/onboarding"
          element={
            <ProtectedRoute>
              <MythologyOnboardingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/character/viewer"
          element={
            <ProtectedRoute>
              <CharacterViewerPage />
            </ProtectedRoute>
          }
        />

        {/* 해쉬태그 전용 페이지 */}
        <Route
          path="/hashtag/:tag"
          element={
            <ProtectedRoute>
              <HashtagPage />
            </ProtectedRoute>
          }
        />

        {/* 매칭되지 않는 라우트는 홈으로 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* 푸시 권한 요청 시트 — 첫 응원 예약 완료 직후 전역 노출 (§4.10) */}
      <PushPermissionSheet />
      {/* 챌린지 종료 리캡 — 최근 종료·미열람 챌린지 자동 1회 노출 */}
      <ChallengeRecapSheet />
    </BrowserRouter>
  );
}
