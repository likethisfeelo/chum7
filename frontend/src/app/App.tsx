import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

import { MainLayout } from '@/shared/layouts/MainLayout';

import { LandingPage } from '@/features/landing/pages/LandingPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { EmailVerificationPage } from '@/features/auth/pages/EmailVerificationPage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { ChallengesPage } from '@/features/challenge/pages/ChallengesPage';
import { ChallengeDetailPage } from '@/features/challenge/pages/ChallengeDetailPage';
import { ChallengeFeedPage } from '@/features/challenge-feed/pages/ChallengeFeedPage';
import { ChallengeBoardPage } from '@/features/challenge-board/pages/ChallengeBoardPage';
import { MEPage } from '@/features/me/pages/MEPage';
import { MyRecordsPage } from '@/features/me/pages/MyRecordsPage';
import { TodayPage } from '@/features/today/pages/TodayPage';
import { TodayPageDebug } from '@/features/today/pages/TodayPageDebug';
import { FeedPage } from '@/features/feed/pages/FeedPage';
import { ProfilePage } from '@/features/profile/pages/ProfilePage';
import { BadgeCollectionPage } from '@/features/profile/pages/BadgeCollectionPage';
import { RemedyPage } from '@/features/verification/pages/RemedyPage';
import { UseTicketPage } from '@/features/cheer/pages/UseTicketPage';
import { QuestBoardPage } from '@/features/quest/pages/QuestBoardPage';
import { MyQuestSubmissionsPage } from '@/features/quest/pages/MyQuestSubmissionsPage';
import { ParticipantFlowPlanPage } from '@/features/planning/pages/ParticipantFlowPlanPage';
import { GentleChallengeMockupPage } from '@/features/mockup/pages/GentleChallengeMockupPage';
import { AdminDocsPage } from '@/features/admin/pages/AdminDocsPage';
import { AdminAccessDeniedPage } from '@/features/admin/pages/AdminAccessDeniedPage';
import { PersonalFeedPage } from '@/features/personal-feed/pages/PersonalFeedPage';
import { FeedSettingsPage } from '@/features/personal-feed/pages/FeedSettingsPage';
import { NotificationsPage } from '@/features/personal-feed/pages/NotificationsPage';
import { NotificationSettingsPage } from '@/features/notifications/pages/NotificationSettingsPage';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/me" replace />;
  return <>{children}</>;
};

const ADMIN_EMAIL_ALLOWLIST = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((v: string) => v.trim().toLowerCase())
  .filter(Boolean);

const hasAdminAccess = (user: { email?: string; role?: string; roles?: string[] } | null): boolean => {
  if (!user) {
    return false;
  }

  const normalizedRole = user.role?.trim().toLowerCase();
  if (normalizedRole === 'admin' || normalizedRole === 'ops') {
    return true;
  }

  const normalizedRoles = (user.roles || []).map((role) => role.trim().toLowerCase());
  if (normalizedRoles.includes('admin') || normalizedRoles.includes('ops')) {
    return true;
  }

  const normalizedEmail = user.email?.trim().toLowerCase();
  if (normalizedEmail && ADMIN_EMAIL_ALLOWLIST.includes(normalizedEmail)) {
    return true;
  }

  return false;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasAdminAccess(user)) return <Navigate to="/admin/forbidden" replace />;
  return <>{children}</>;
};

export default function App() {
  return (
    <BrowserRouter>
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
          path="/challenges/:challengeId"
          element={
            <ProtectedRoute>
              <ChallengeDetailPage />
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
          path="/today/debug"
          element={
            <ProtectedRoute>
              <TodayPageDebug />
            </ProtectedRoute>
          }
        />
        <Route
          path="/outer-space"
          element={
            <ProtectedRoute>
              <MainLayout>
                <FeedPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/assets"
          element={
            <ProtectedRoute>
              <MainLayout>
                <ProfilePage />
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
        <Route
          path="/cheer/use-ticket"
          element={
            <ProtectedRoute>
              <UseTicketPage />
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

        <Route
          path="/admin/docs"
          element={
            <AdminRoute>
              <MainLayout>
                <AdminDocsPage />
              </MainLayout>
            </AdminRoute>
          }
        />

        <Route
          path="/admin/forbidden"
          element={
            <ProtectedRoute>
              <MainLayout>
                <AdminAccessDeniedPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/ux-plan"
          element={
            <ProtectedRoute>
              <MainLayout>
                <ParticipantFlowPlanPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        <Route path="/design-mockup/gentle-challenge" element={<GentleChallengeMockupPage />} />

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

        <Route path="/earth" element={<Navigate to="/outer-space" replace />} />

        {/* 매칭되지 않는 라우트는 홈으로 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
