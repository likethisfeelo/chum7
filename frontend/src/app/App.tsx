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
import { MEPage } from '@/features/me/pages/MEPage';
import { TodayPage } from '@/features/today/pages/TodayPage';
import { FeedPage } from '@/features/feed/pages/FeedPage';
import { ProfilePage } from '@/features/profile/pages/ProfilePage';
import { BadgeCollectionPage } from '@/features/profile/pages/BadgeCollectionPage';
import { RemedyPage } from '@/features/verification/pages/RemedyPage';
import { UseTicketPage } from '@/features/cheer/pages/UseTicketPage';
import { QuestBoardPage } from '@/features/quest/pages/QuestBoardPage';
import { MyQuestSubmissionsPage } from '@/features/quest/pages/MyQuestSubmissionsPage';
import { ParticipantFlowPlanPage } from '@/features/planning/pages/ParticipantFlowPlanPage';

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
          path="/earth"
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
          path="/ux-plan"
          element={
            <ProtectedRoute>
              <MainLayout>
                <ParticipantFlowPlanPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* 매칭되지 않는 라우트는 홈으로 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
