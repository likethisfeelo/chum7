chme/
│
├── 📦 frontend/                              # 사용자 앱 (PWA)
│   ├── public/
│   │   ├── manifest.json
│   │   └── icons/
│   │       ├── icon-192.png
│   │       └── icon-512.png
│   │
│   ├── src/
│   │   ├── main.tsx
│   │   │
│   │   ├── app/
│   │   │   └── App.tsx                       # 라우팅, QueryClient, ProtectedRoute
│   │   │
│   │   ├── lib/
│   │   │   └── api-client.ts                 # Axios + 자동 토큰 갱신
│   │   │
│   │   ├── styles/
│   │   │   ├── index.css
│   │   │   └── animations.css
│   │   │
│   │   ├── shared/
│   │   │   ├── layouts/
│   │   │   │   ├── MainLayout.tsx
│   │   │   │   └── BottomNav.tsx             # 5개 탭 (ME 중앙 돌출)
│   │   │   │
│   │   │   ├── components/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Textarea.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── BottomSheet.tsx
│   │   │   │   ├── Loading.tsx
│   │   │   │   ├── EmptyState.tsx
│   │   │   │   └── ProgressBar.tsx
│   │   │   │
│   │   │   ├── hooks/
│   │   │   │   ├── useDebounce.ts
│   │   │   │   └── useIntersectionObserver.ts
│   │   │   │
│   │   │   ├── utils/
│   │   │   │   ├── date.ts
│   │   │   │   └── format.ts
│   │   │   │
│   │   │   └── types/
│   │   │       └── common.types.ts
│   │   │
│   │   └── features/
│   │       │
│   │       ├── auth/
│   │       │   ├── store/
│   │       │   │   └── authStore.ts          # Zustand + persist
│   │       │   └── pages/
│   │       │       ├── LoginPage.tsx
│   │       │       └── RegisterPage.tsx
│   │       │
│   │       ├── challenge/
│   │       │   └── pages/
│   │       │       ├── ChallengesPage.tsx    # 탭 1 - 탐색, 카테고리, 정렬
│   │       │       └── ChallengeDetailPage.tsx
│   │       │
│   │       ├── verification/
│   │       │   ├── pages/
│   │       │   │   ├── MEPage.tsx            # 탭 3 - 인증/응원 중심 ⭐
│   │       │   │   └── RemedyPage.tsx        # Day 6 보완
│   │       │   └── components/
│   │       │       └── VerificationSheet.tsx # 인증 바텀시트 + S3 업로드
│   │       │
│   │       ├── cheer/
│   │       │   ├── pages/
│   │       │   │   └── CheerUseTicketPage.tsx # 예약 응원
│   │       │   └── components/
│   │       │       ├── CheerOpportunityPopup.tsx # 즉시 응원 팝업 ⭐
│   │       │       └── CheerTicketCard.tsx
│   │       │
│   │       ├── today/
│   │       │   └── pages/
│   │       │       └── TodayPage.tsx         # 탭 4 - 대시보드
│   │       │
│   │       ├── feed/
│   │       │   └── pages/
│   │       │       └── FeedPage.tsx          # 탭 2 - 공개 피드
│   │       │
│   │       └── profile/
│   │           └── pages/
│   │               ├── ProfilePage.tsx       # 탭 5 - 애셋
│   │               └── BadgeCollectionPage.tsx
│   │
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── .env.dev
│   └── .env.prod
│
│
├── 📦 admin-frontend/                        # 관리자 앱 (admin.chum7.com)
│   ├── src/
│   │   ├── main.tsx
│   │   ├── index.css
│   │   │
│   │   ├── App.tsx                           # 라우팅 + Admin ProtectedRoute
│   │   │
│   │   ├── lib/
│   │   │   └── api-client.ts                 # 같은 API + 어드민 토큰
│   │   │
│   │   ├── store/
│   │   │   └── authStore.ts                  # admins 그룹 체크
│   │   │
│   │   ├── layouts/
│   │   │   └── AdminLayout.tsx               # 상단 네비게이션
│   │   │
│   │   └── pages/
│   │       ├── AdminLoginPage.tsx            # Cognito 로그인 + admins 그룹 확인
│   │       ├── DashboardPage.tsx             # 통계 (사용자/챌린지/참여)
│   │       ├── ChallengeManagePage.tsx       # 챌린지 CRUD + 활성/비활성
│   │       └── UserManagePage.tsx            # 사용자 목록
│   │
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── .env.dev
│   └── .env.prod
│
│
├── 📦 backend/
│   └── services/
│       │
│       ├── auth/
│       │   ├── register/
│       │   │   └── index.ts                  # POST /auth/register
│       │   ├── login/
│       │   │   └── index.ts                  # POST /auth/login
│       │   ├── refresh-token/
│       │   │   └── index.ts                  # POST /auth/refresh
│       │   ├── get-profile/
│       │   │   └── index.ts                  # GET /auth/profile
│       │   └── update-profile/
│       │       └── index.ts                  # PUT /auth/profile
│       │
│       ├── challenge/
│       │   ├── list/
│       │   │   └── index.ts                  # GET /challenges
│       │   ├── detail/
│       │   │   └── index.ts                  # GET /challenges/:id
│       │   ├── join/
│       │   │   └── index.ts                  # POST /challenges/:id/join
│       │   ├── my-challenges/
│       │   │   └── index.ts                  # GET /challenges/my
│       │   └── stats/
│       │       └── index.ts                  # GET /challenges/:id/stats
│       │
│       ├── verification/
│       │   ├── submit/
│       │   │   └── index.ts                  # POST /verifications ⭐ (델타 계산)
│       │   ├── get/
│       │   │   └── index.ts                  # GET /verifications/:id
│       │   ├── list/
│       │   │   └── index.ts                  # GET /verifications
│       │   ├── upload-url/
│       │   │   └── index.ts                  # POST /verifications/upload-url
│       │   └── remedy/
│       │       └── index.ts                  # POST /verifications/remedy (Day 6)
│       │
│       ├── cheer/
│       │   ├── send-immediate/
│       │   │   └── index.ts                  # POST /cheers/immediate
│       │   ├── use-ticket/
│       │   │   └── index.ts                  # POST /cheers/tickets/use
│       │   ├── send-scheduled/
│       │   │   └── index.ts                  # EventBridge 자동 발송 (1분마다)
│       │   ├── get-targets/
│       │   │   └── index.ts                  # GET /cheers/targets
│       │   ├── thank/
│       │   │   └── index.ts                  # POST /cheers/:id/thank
│       │   ├── get-my-cheers/
│       │   │   └── index.ts                  # GET /cheers/my
│       │   └── get-scheduled/
│       │       └── index.ts                  # GET /cheers/scheduled
│       │
│       └── admin/                            # 어드민 전용 Lambda
│           ├── challenge/
│           │   ├── create/
│           │   │   └── index.ts              # POST /admin/challenges
│           │   ├── update/
│           │   │   └── index.ts              # PUT /admin/challenges/:id
│           │   ├── delete/
│           │   │   └── index.ts              # DELETE /admin/challenges/:id
│           │   └── toggle/
│           │       └── index.ts              # POST /admin/challenges/:id/toggle
│           ├── user/
│           │   └── list/
│           │       └── index.ts              # GET /admin/users
│           └── stats/
│               └── overview/
│                   └── index.ts              # GET /admin/stats/overview
│
│
├── 📦 infra/
│   ├── bin/
│   │   └── chme.ts                           # CDK 앱 엔트리 + 스택 의존성
│   │
│   ├── stacks/
│   │   ├── core-stack.ts                     # API GW, Cognito, admins 그룹, SNS, EventBridge
│   │   ├── auth-stack.ts                     # Users 테이블 + 5개 Auth Lambda
│   │   ├── challenge-stack.ts                # Challenges/UserChallenges 테이블 + 5개 Lambda
│   │   ├── verification-stack.ts             # Verifications 테이블 + 5개 Lambda
│   │   ├── cheer-stack.ts                    # Cheers/Tickets 테이블 + 7개 Lambda
│   │   └── admin-stack.ts                    # 6개 Admin Lambda (admins 그룹 권한)
│   │
│   ├── config/
│   │   ├── dev.ts
│   │   └── prod.ts
│   │
│   ├── cdk.json
│   └── package.json
│
│
├── 📦 scripts/
│   ├── deploy-dev.ps1                        # 전체 DEV 배포
│   ├── deploy-prod.ps1                       # 전체 PROD 배포
│   ├── deploy-admin-dev.ps1                  # 어드민 DEV 배포
│   ├── deploy-admin-prod.ps1                 # 어드민 PROD 배포
│   └── create-admin-user.ps1                 # Cognito 관리자 사용자 생성
│
│
├── 📦 docs/
│   ├── CHME_서비스_기획서_1_0.pdf
│   ├── LAMBDA_COMPLETE.md
│   ├── FRONTEND_COMPLETE.md
│   ├── ADMIN_COMPLETE.md
│   └── admin-deployment-guide.md
│
├── .gitignore
├── README.md
└── package.json                              # Root workspace


═══════════════════════════════════════════════════════
📊 총계
═══════════════════════════════════════════════════════

Lambda 함수:     28개
  Auth:           5개
  Challenge:      5개
  Verification:   5개
  Cheer:          7개
  Admin:          6개

DynamoDB 테이블:  6개
  Users
  Challenges
  UserChallenges
  Verifications
  Cheers
  UserCheerTickets

CDK Stacks:       6개
  core, auth, challenge, verification, cheer, admin

프론트엔드 페이지: 11개 (사용자)
  LoginPage, RegisterPage
  ChallengesPage, ChallengeDetailPage
  MEPage, RemedyPage, CheerUseTicketPage
  TodayPage, FeedPage
  ProfilePage, BadgeCollectionPage

어드민 페이지:     4개
  AdminLoginPage, DashboardPage
  ChallengeManagePage, UserManagePage

공통 컴포넌트:    15개
  Button, Input, Textarea, Modal, BottomSheet
  Loading, EmptyState, ProgressBar
  BottomNav, MainLayout, AdminLayout
  VerificationSheet, CheerOpportunityPopup, CheerTicketCard


═══════════════════════════════════════════════════════
🌐 도메인 구조
═══════════════════════════════════════════════════════

사용자 앱:   www.chum7.com      → S3 (chum7-prod-static/)
어드민 앱:   admin.chum7.com    → S3 (chum7-prod-static/admin/)
API:        api.chum7.com      → API Gateway (같은 인스턴스)
이미지:      www.chum7.com/uploads → S3 (chum7-prod-uploads/)

DEV:
  앱:        test.chum7.com
  API:       dev.chum7.com
  어드민:    admin-dev.chum7.com


═══════════════════════════════════════════════════════
🔌 API 엔드포인트 전체 목록
═══════════════════════════════════════════════════════

[Auth]
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
GET    /auth/profile
PUT    /auth/profile

[Challenge]
GET    /challenges
GET    /challenges/:id
POST   /challenges/:id/join
GET    /challenges/my
GET    /challenges/:id/stats

[Verification]
POST   /verifications
GET    /verifications/:id
GET    /verifications
POST   /verifications/upload-url
POST   /verifications/remedy

[Cheer]
POST   /cheers/immediate
POST   /cheers/tickets/use
GET    /cheers/targets
POST   /cheers/:id/thank
GET    /cheers/my
GET    /cheers/scheduled
GET    /tickets/my

[Admin]
POST   /admin/challenges
PUT    /admin/challenges/:id
DELETE /admin/challenges/:id
POST   /admin/challenges/:id/toggle
GET    /admin/users
GET    /admin/stats/overview

총 25개 엔드포인트
