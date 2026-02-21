# CHME 어드민 시스템 완성 🎯

## ✅ 완성 현황

### 백엔드 (6개 Lambda)
1. ✅ **admin-create-challenge** - 챌린지 생성
2. ✅ **admin-update-challenge** - 챌린지 수정
3. ✅ **admin-delete-challenge** - 챌린지 삭제 (참여자 확인)
4. ✅ **admin-toggle-challenge** - 활성화/비활성화
5. ✅ **admin-list-users** - 사용자 목록
6. ✅ **admin-stats** - 통계 조회

### 프론트엔드 (7개 페이지/컴포넌트)
1. ✅ **AdminLoginPage** - 관리자 로그인
2. ✅ **DashboardPage** - 대시보드 (통계)
3. ✅ **ChallengeManagePage** - 챌린지 관리
4. ✅ **ChallengeModal** - 챌린지 생성/수정 모달
5. ✅ **UserManagePage** - 사용자 관리
6. ✅ **AdminLayout** - 레이아웃
7. ✅ **authStore** - 상태 관리

### 인프라
1. ✅ **AdminStack** - CDK Stack
2. ✅ **Cognito admins 그룹** - 권한 관리
3. ✅ **CloudFront 설정** - admin.chum7.com
4. ✅ **배포 스크립트** - PowerShell

---

## 📂 파일 배치 가이드

### 백엔드 Lambda

```
backend/services/admin/
├── challenge/
│   ├── create/
│   │   └── index.ts          ← admin-create-challenge.ts
│   ├── update/
│   │   └── index.ts          ← admin-other-lambdas.ts (update 부분)
│   ├── delete/
│   │   └── index.ts          ← admin-other-lambdas.ts (delete 부분)
│   └── toggle/
│       └── index.ts          ← admin-other-lambdas.ts (toggle 부분)
│
├── user/
│   └── list/
│       └── index.ts          ← admin-other-lambdas.ts (listUsers 부분)
│
└── stats/
    └── overview/
        └── index.ts          ← admin-other-lambdas.ts (stats 부분)
```

### 인프라 Stack

```
infra/
├── stacks/
│   └── admin-stack.ts        ← admin-stack.ts
│
└── bin/
    └── chme.ts               ← admin-cognito-setup.sh (CDK 앱 부분)
```

### 어드민 프론트엔드

```
admin-frontend/
├── src/
│   ├── App.tsx               ← admin-frontend-1.tsx
│   ├── main.tsx              ← admin-frontend-3.tsx
│   ├── index.css             ← admin-frontend-3.tsx
│   │
│   ├── store/
│   │   └── authStore.ts      ← admin-frontend-1.tsx
│   │
│   ├── lib/
│   │   └── api-client.ts     ← admin-frontend-3.tsx
│   │
│   ├── layouts/
│   │   └── AdminLayout.tsx   ← admin-frontend-3.tsx
│   │
│   └── pages/
│       ├── AdminLoginPage.tsx        ← admin-frontend-1.tsx
│       ├── DashboardPage.tsx         ← admin-frontend-1.tsx
│       ├── ChallengeManagePage.tsx   ← admin-frontend-2.tsx
│       └── UserManagePage.tsx        ← admin-frontend-2.tsx
│
├── index.html                ← admin-frontend-3.tsx
├── package.json              ← admin-frontend-3.tsx
├── vite.config.ts            ← admin-frontend-3.tsx
├── tailwind.config.js        ← admin-frontend-3.tsx
├── tsconfig.json             ← admin-frontend-3.tsx
├── .env.dev                  ← admin-frontend-3.tsx
└── .env.prod                 ← admin-frontend-3.tsx
```

### 스크립트

```
scripts/
├── create-admin-user.ps1     ← admin-cognito-setup.sh (PowerShell)
├── deploy-admin-dev.ps1      ← admin-deployment-guide.md
└── deploy-admin-prod.ps1     ← admin-deployment-guide.md
```

---

## 🚀 설치 및 실행

### 1. 백엔드 배포

```bash
# 1-1. Admin Stack 배포
cd infra
npx cdk deploy chme-dev-admin --context stage=dev

# 1-2. 관리자 사용자 생성
cd ../scripts
./create-admin-user.ps1 -Stage dev -Email admin@chme.app -TempPassword Admin123!
```

### 2. 프론트엔드 설정

```bash
# 2-1. 의존성 설치
cd admin-frontend
npm install

# 2-2. 환경 변수 설정
# .env.dev 파일 수정
VITE_API_URL=https://dev.chum7.com
VITE_AWS_REGION=ap-northeast-2
VITE_COGNITO_CLIENT_ID=YOUR_CLIENT_ID  # Core Stack 출력에서 가져오기

# 2-3. 로컬 개발 서버
npm run dev
# → http://localhost:5174
```

### 3. 배포

```powershell
# DEV 배포
.\scripts\deploy-admin-dev.ps1

# PROD 배포
.\scripts\deploy-admin-prod.ps1
```

---

## 🔐 권한 관리

### Cognito admins 그룹

**생성 위치:** `infra/stacks/core-stack.ts`

```typescript
const adminsGroup = new CfnUserPoolGroup(this, 'AdminsGroup', {
  userPoolId: this.userPool.userPoolId,
  groupName: 'admins',
  description: 'CHME 관리자 그룹',
  precedence: 0,
});
```

### Lambda 권한 체크

모든 Admin Lambda 함수에서 그룹 확인:

```typescript
function isAdmin(event: APIGatewayProxyEvent): boolean {
  const groups = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  if (!groups) return false;
  if (typeof groups === 'string') return groups === 'admins';
  return Array.isArray(groups) && groups.includes('admins');
}
```

### 사용자를 admins 그룹에 추가

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id YOUR_USER_POOL_ID \
  --username admin@chme.app \
  --group-name admins
```

---

## 🎯 API 엔드포인트

### 어드민 전용 API (같은 API Gateway 사용)

```
베이스 URL: https://dev.chum7.com (DEV) / https://api.chum7.com (PROD)

POST   /admin/challenges              # 챌린지 생성
PUT    /admin/challenges/:id          # 챌린지 수정  
DELETE /admin/challenges/:id          # 챌린지 삭제
POST   /admin/challenges/:id/toggle   # 활성/비활성
GET    /admin/users                   # 사용자 목록
GET    /admin/stats/overview          # 통계
```

### 요청 예시

```typescript
// 챌린지 생성
POST /admin/challenges
{
  "title": "아침 조깅 챌린지",
  "description": "매일 아침 30분 조깅하기",
  "category": "health",
  "targetTime": "07:00",
  "identityKeyword": "건강한",
  "badgeIcon": "🏃",
  "badgeName": "Morning Runner"
}

// 챌린지 수정
PUT /admin/challenges/{challengeId}
{
  "title": "아침 러닝 챌린지",
  "description": "업데이트된 설명"
}

// 활성화/비활성화
POST /admin/challenges/{challengeId}/toggle
// Body 없음

// 챌린지 삭제
DELETE /admin/challenges/{challengeId}
// 참여자가 있으면 400 에러

// 사용자 목록
GET /admin/users?limit=50&lastKey=...

// 통계
GET /admin/stats/overview
```

---

## 🎨 화면 구성

### 1. 대시보드
- 전체 사용자 수
- 전체 챌린지 수
- 총 참여 수

### 2. 챌린지 관리
- 챌린지 목록 (테이블)
- 챌린지 생성 버튼
- 수정/삭제/활성화 버튼
- 챌린지 생성/수정 모달

### 3. 사용자 관리
- 사용자 목록 (테이블)
- 이메일, 이름, 레벨, 응원권 등

---

## 🛡️ 보안 체크리스트

✅ **Cognito 권한 관리**
- admins 그룹으로 관리자 식별
- Lambda에서 그룹 체크

✅ **API 보안**
- Cognito Authorizer 사용
- JWT 토큰 검증
- 403 에러 반환

✅ **데이터 보호**
- 참여자 있는 챌린지 삭제 방지
- 비활성화 기능 제공

✅ **네트워크 보안**
- HTTPS 강제
- CORS 설정
- CloudFront 사용

---

## 📊 테스트

### 1. 로그인 테스트
```
1. https://admin.chum7.com 접속
2. 관리자 계정으로 로그인
3. 대시보드 확인
```

### 2. 챌린지 생성
```
1. 챌린지 관리 페이지
2. "새 챌린지" 버튼
3. 폼 작성 및 저장
4. DynamoDB 확인
5. 사용자 앱에서 보이는지 확인
```

### 3. 권한 테스트
```
1. 일반 사용자로 로그인 시도
2. "관리자 권한이 필요합니다" 메시지 확인
3. API 직접 호출 시 403 에러 확인
```

---

## 🔍 모니터링

### CloudWatch Logs

```bash
# 로그 확인
aws logs tail /aws/lambda/chme-dev-admin-create-challenge --follow

# 에러 검색
aws logs filter-log-events \
  --log-group-name /aws/lambda/chme-dev-admin-create-challenge \
  --filter-pattern "ERROR"
```

### CloudWatch Metrics
- Lambda Invocations
- Lambda Errors
- Lambda Duration

---

## 🌐 도메인 구조

```
사용자 앱:
- www.chum7.com       → S3 (/)
- dev.chum7.com       → S3 (/)

어드민 앱:
- admin.chum7.com     → S3 (/admin/)
- admin-dev.chum7.com → S3 (/admin/)

API:
- api.chum7.com       → API Gateway
- dev.chum7.com       → API Gateway
```

---

## 📦 제공된 파일

1. **admin-create-challenge.ts** - 챌린지 생성 Lambda
2. **admin-other-lambdas.ts** - 나머지 5개 Lambda
3. **admin-stack.ts** - CDK Stack
4. **admin-cognito-setup.sh** - Cognito 설정 + 사용자 생성 스크립트
5. **admin-frontend-1.tsx** - App, Login, Dashboard
6. **admin-frontend-2.tsx** - Challenge/User 관리 페이지
7. **admin-frontend-3.tsx** - Layout, API Client, 설정 파일
8. **admin-deployment-guide.md** - 배포 가이드

---

## ✨ 핵심 기능

### 챌린지 관리
- ✅ 생성 (아이콘, 카테고리, 목표시간 등)
- ✅ 수정
- ✅ 삭제 (참여자 확인)
- ✅ 활성화/비활성화

### 사용자 관리
- ✅ 전체 사용자 목록
- ✅ 이메일, 레벨, 응원권 표시
- ✅ 가입일 표시

### 통계
- ✅ 전체 사용자 수
- ✅ 전체 챌린지 수
- ✅ 총 참여 수

### 보안
- ✅ Cognito admins 그룹
- ✅ Lambda 권한 체크
- ✅ HTTPS 강제

---

## 🎉 완성!

**CHME 어드민 시스템 100% 완성**

- 백엔드: 6개 Lambda
- 프론트엔드: 7개 컴포넌트
- 인프라: AdminStack + Cognito 그룹
- 배포: 자동화 스크립트
- 보안: admins 그룹 권한 관리

**라이브 서비스와 동일한 S3 & API 활용** ✅

즉시 배포 가능한 상태입니다! 🚀
