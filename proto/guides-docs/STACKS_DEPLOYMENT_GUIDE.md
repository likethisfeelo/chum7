# 6개 Stack 파일 배치 가이드

## 📦 생성된 파일 (6개)

### 1. **core-stack.ts** → `infra/stacks/core-stack.ts`
- API Gateway (HTTP API + JWT Authorizer)
- Cognito User Pool + Client + Admins Group
- DynamoDB 6개 테이블 (Users, Challenges, UserChallenges, Verifications, Cheers, UserCheerTickets)
- S3 Uploads Bucket (참조)
- SNS Topic (푸시 알림)
- EventBridge (스케줄러)

### 2. **stack-auth.ts** → `infra/stacks/auth-stack.ts` (⚠️ 이름 변경)
- 5개 Auth Lambda:
  - register (회원가입)
  - login (로그인)
  - refresh-token (토큰 갱신)
  - get-profile (프로필 조회)
  - update-profile (프로필 수정)

### 3. **stack-challenge.ts** → `infra/stacks/challenge-stack.ts` (⚠️ 이름 변경)
- 5개 Challenge Lambda:
  - list (챌린지 목록)
  - detail (챌린지 상세)
  - join (챌린지 참여)
  - my-challenges (내 챌린지)
  - stats (챌린지 통계)

### 4. **stack-verification.ts** → `infra/stacks/verification-stack.ts` (⚠️ 이름 변경)
- 5개 Verification Lambda:
  - submit (인증 제출 + 델타 계산) ⭐
  - get (인증 조회)
  - list (인증 목록)
  - upload-url (S3 Presigned URL)
  - remedy (Day 6 보완)

### 5. **stack-cheer.ts** → `infra/stacks/cheer-stack.ts` (⚠️ 이름 변경)
- 7개 Cheer Lambda + EventBridge:
  - send-immediate (즉시 응원)
  - use-ticket (응원권 사용 → 예약)
  - send-scheduled (예약 응원 자동 발송) ⭐ EventBridge 1분마다
  - get-targets (응원 대상 조회)
  - thank (응원 감사)
  - get-my-cheers (받은 응원)
  - get-scheduled (예약된 응원)
  - get-my-tickets (내 응원권)

### 6. **stack-admin.ts** → `infra/stacks/admin-stack.ts` (⚠️ 이름 변경)
- 6개 Admin Lambda (admins 그룹만 접근):
  - create-challenge (챌린지 생성)
  - update-challenge (챌린지 수정)
  - delete-challenge (챌린지 삭제)
  - toggle-challenge (활성/비활성)
  - list-users (사용자 목록)
  - stats (통계 대시보드)

---

## 📂 파일 배치 방법

### Step 1: stacks 폴더 생성
```powershell
cd C:\chum7\infra
mkdir stacks  # 없으면 생성
```

### Step 2: 파일 복사 (⚠️ 이름 변경 주의)
```
다운로드 파일              →    복사할 위치
──────────────────────────────────────────────────────
core-stack.ts           →    infra/stacks/core-stack.ts
stack-auth.ts           →    infra/stacks/auth-stack.ts          (이름 변경!)
stack-challenge.ts      →    infra/stacks/challenge-stack.ts     (이름 변경!)
stack-verification.ts   →    infra/stacks/verification-stack.ts  (이름 변경!)
stack-cheer.ts          →    infra/stacks/cheer-stack.ts         (이름 변경!)
stack-admin.ts          →    infra/stacks/admin-stack.ts         (이름 변경!)
```

---

## 📊 최종 폴더 구조

```
C:\chum7\infra\
├── bin/
│   └── chme.ts                      ✅ 이미 복사
│
├── config/
│   ├── dev.ts                       ✅ 이미 복사
│   └── prod.ts                      ✅ 이미 복사
│
├── stacks/                          ← 여기에 6개 파일
│   ├── core-stack.ts                ✅ 방금 생성
│   ├── auth-stack.ts                ✅ 방금 생성
│   ├── challenge-stack.ts           ✅ 방금 생성
│   ├── verification-stack.ts        ✅ 방금 생성
│   ├── cheer-stack.ts               ✅ 방금 생성
│   └── admin-stack.ts               ✅ 방금 생성
│
├── cdk.json                         ✅ 이미 복사
├── package.json                     ✅ 이미 복사
└── tsconfig.json                    ✅ 이미 복사
```

---

## ⚙️ 각 Stack의 주요 기능

### 1. CoreStack (핵심 인프라)
```typescript
- API Gateway HTTP API
- Cognito User Pool + admins 그룹
- DynamoDB 6개 테이블 (모든 GSI 포함)
- S3 Uploads Bucket 참조
- SNS Topic (푸시 알림)
- EventBridge (스케줄러)
```

### 2. AuthStack (인증)
```typescript
- POST   /auth/register        (회원가입)
- POST   /auth/login           (로그인)
- POST   /auth/refresh         (토큰 갱신)
- GET    /auth/profile         (프로필 조회)
- PUT    /auth/profile         (프로필 수정)
```

### 3. ChallengeStack (챌린지)
```typescript
- GET    /challenges                  (목록)
- GET    /challenges/{id}             (상세)
- POST   /challenges/{id}/join        (참여)
- GET    /challenges/my               (내 챌린지)
- GET    /challenges/{id}/stats       (통계)
```

### 4. VerificationStack (인증)
```typescript
- POST   /verifications               (인증 제출)
- GET    /verifications/{id}          (조회)
- GET    /verifications               (목록)
- POST   /verifications/upload-url    (S3 URL)
- POST   /verifications/remedy        (Day 6 보완)
```

### 5. CheerStack (응원)
```typescript
- POST   /cheers/immediate            (즉시 응원)
- POST   /cheers/tickets/use          (응원권 사용)
- GET    /cheers/targets              (응원 대상)
- POST   /cheers/{id}/thank           (감사)
- GET    /cheers/my                   (받은 응원)
- GET    /cheers/scheduled            (예약된 응원)
- GET    /tickets/my                  (내 응원권)

+ EventBridge Rule: 1분마다 send-scheduled 실행
```

### 6. AdminStack (관리자)
```typescript
- POST   /admin/challenges                (생성)
- PUT    /admin/challenges/{id}           (수정)
- DELETE /admin/challenges/{id}           (삭제)
- POST   /admin/challenges/{id}/toggle    (활성화)
- GET    /admin/users                     (사용자 목록)
- GET    /admin/stats/overview            (통계)
```

---

## 🚀 배포 순서

### 1. 파일 배치 확인
```powershell
cd C:\chum7\infra

# 구조 확인
tree /F
```

### 2. 의존성 설치
```powershell
npm install
```

### 3. TypeScript 컴파일 확인
```powershell
npm run build
```

### 4. CloudFormation 템플릿 생성 (테스트)
```powershell
npm run synth:dev
```

### 5. Bootstrap (최초 1회)
```powershell
cdk bootstrap aws://532393804562/ap-northeast-2
```

### 6. DEV 배포
```powershell
npm run deploy:dev

# 또는
cdk deploy --all --context stage=dev --require-approval never
```

### 7. PROD 배포
```powershell
npm run deploy:prod

# 또는
cdk deploy --all --context stage=prod --require-approval never
```

---

## ⚠️ 주의사항

### 1. 파일 이름 반드시 변경
```
❌ stack-auth.ts (다운로드 파일명)
✅ auth-stack.ts (실제 사용할 이름)
```

### 2. Lambda 함수 경로 확인
모든 Lambda entry 경로는 `../backend/services/...` 형태입니다.

예:
```typescript
entry: '../backend/services/auth/register/index.ts'
```

실제 경로:
```
C:\chum7\backend\services\auth\register\index.ts
```

→ Lambda 함수 파일들이 이 경로에 있어야 합니다!

### 3. S3 Bucket 참조
CoreStack에서 S3 uploadsBucket은 **참조**입니다 (생성 아님):
```typescript
this.uploadsBucket = Bucket.fromBucketName(
  this,
  'UploadsBucket',
  config.s3.uploadsBucket // 이미 존재하는 버킷
);
```

→ 버킷이 없으면 에러납니다. 먼저 버킷이 있어야 합니다.

---

## 📋 체크리스트

- [ ] `infra/stacks/` 폴더 생성
- [ ] `core-stack.ts` 복사
- [ ] `stack-auth.ts` → `auth-stack.ts` 이름 변경 후 복사
- [ ] `stack-challenge.ts` → `challenge-stack.ts` 이름 변경 후 복사
- [ ] `stack-verification.ts` → `verification-stack.ts` 이름 변경 후 복사
- [ ] `stack-cheer.ts` → `cheer-stack.ts` 이름 변경 후 복사
- [ ] `stack-admin.ts` → `admin-stack.ts` 이름 변경 후 복사
- [ ] `npm install` 실행
- [ ] `npm run build` 성공 확인
- [ ] `cdk bootstrap` 실행 (최초 1회)
- [ ] `npm run deploy:dev` 실행

---

## 🎉 완료!

6개 Stack 파일로 **28개 Lambda 함수**와 **25개 API 엔드포인트**가 배포됩니다!

```
총 리소스:
- Lambda: 28개
- DynamoDB: 6개 테이블 (12개 GSI 포함)
- API Gateway: 1개 (25개 엔드포인트)
- Cognito: 1개 User Pool + 1개 Client + 1개 Group
- S3: 참조 (이미 존재)
- SNS: 1개 Topic
- EventBridge: 1개 Rule (1분마다)
```

**복붙하고 배포하시면 됩니다!** 🚀
