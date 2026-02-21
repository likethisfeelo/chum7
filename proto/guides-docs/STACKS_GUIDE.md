# CHME Stack 파일 배치 가이드

## 📦 제공된 파일 (6개)

```
1. core-stack.ts          → infra/stacks/core-stack.ts
2. auth-stack.ts          → infra/stacks/auth-stack.ts
3. challenge-stack.ts     → infra/stacks/challenge-stack.ts
4. verification-stack.ts  → infra/stacks/verification-stack.ts
5. cheer-stack.ts         → infra/stacks/cheer-stack.ts
6. admin-stack.ts         → infra/stacks/admin-stack.ts
```

---

## 📂 파일 구조

```
C:\chum7\
└── infra/
    ├── bin/
    │   └── chme.ts              (이미 생성됨)
    │
    ├── stacks/                  ← 이 폴더에 6개 파일 복사
    │   ├── core-stack.ts        ✅
    │   ├── auth-stack.ts        ✅
    │   ├── challenge-stack.ts   ✅
    │   ├── verification-stack.ts ✅
    │   ├── cheer-stack.ts       ✅
    │   └── admin-stack.ts       ✅
    │
    ├── config/
    │   ├── dev.ts               (이미 생성됨)
    │   └── prod.ts              (이미 생성됨)
    │
    ├── cdk.json                 (이미 생성됨)
    ├── package.json             (이미 생성됨)
    └── tsconfig.json            (이미 생성됨)
```

---

## 🎯 각 Stack 설명

### 1. CoreStack (core-stack.ts)
**핵심 인프라 - 모든 스택의 기반**

생성 리소스:
- ✅ API Gateway (HTTP API)
- ✅ Cognito User Pool + Client
- ✅ Cognito admins 그룹
- ✅ DynamoDB 테이블 6개:
  - Users
  - Challenges
  - UserChallenges
  - Verifications
  - Cheers
  - UserCheerTickets
- ✅ S3 Bucket (기존 버킷 참조)
- ✅ SNS Topic (푸시 알림용)
- ✅ EventBridge (예약 응원용)

---

### 2. AuthStack (auth-stack.ts)
**인증 시스템 - 5개 Lambda**

Lambda 함수:
1. `chme-${stage}-auth-register` - POST /auth/register
2. `chme-${stage}-auth-login` - POST /auth/login
3. `chme-${stage}-auth-refresh` - POST /auth/refresh
4. `chme-${stage}-auth-get-profile` - GET /auth/profile
5. `chme-${stage}-auth-update-profile` - PUT /auth/profile

---

### 3. ChallengeStack (challenge-stack.ts)
**챌린지 시스템 - 5개 Lambda**

Lambda 함수:
1. `chme-${stage}-challenge-list` - GET /challenges
2. `chme-${stage}-challenge-detail` - GET /challenges/{challengeId}
3. `chme-${stage}-challenge-join` - POST /challenges/{challengeId}/join
4. `chme-${stage}-challenge-my` - GET /challenges/my
5. `chme-${stage}-challenge-stats` - GET /challenges/{challengeId}/stats

---

### 4. VerificationStack (verification-stack.ts)
**인증 시스템 - 5개 Lambda**

Lambda 함수:
1. `chme-${stage}-verification-submit` - POST /verifications (델타 계산 ⭐)
2. `chme-${stage}-verification-get` - GET /verifications/{verificationId}
3. `chme-${stage}-verification-list` - GET /verifications
4. `chme-${stage}-verification-upload-url` - POST /verifications/upload-url (S3 Presigned URL)
5. `chme-${stage}-verification-remedy` - POST /verifications/remedy (Day 6 보완)

---

### 5. CheerStack (cheer-stack.ts)
**응원 시스템 - 7개 Lambda + EventBridge**

Lambda 함수:
1. `chme-${stage}-cheer-send-immediate` - POST /cheers/immediate (즉시 응원)
2. `chme-${stage}-cheer-use-ticket` - POST /cheers/tickets/use (예약 응원)
3. `chme-${stage}-cheer-send-scheduled` - EventBridge (1분마다 자동 실행 ⭐)
4. `chme-${stage}-cheer-get-targets` - GET /cheers/targets
5. `chme-${stage}-cheer-thank` - POST /cheers/{cheerId}/thank
6. `chme-${stage}-cheer-get-my` - GET /cheers/my
7. `chme-${stage}-cheer-get-scheduled` - GET /cheers/scheduled

특별 기능:
- ✅ EventBridge Rule: 매 1분마다 예약된 응원 자동 발송

---

### 6. AdminStack (admin-stack.ts)
**어드민 시스템 - 6개 Lambda (admins 그룹 권한 필요)**

Lambda 함수:
1. `chme-${stage}-admin-create-challenge` - POST /admin/challenges
2. `chme-${stage}-admin-update-challenge` - PUT /admin/challenges/{challengeId}
3. `chme-${stage}-admin-delete-challenge` - DELETE /admin/challenges/{challengeId}
4. `chme-${stage}-admin-toggle-challenge` - POST /admin/challenges/{challengeId}/toggle
5. `chme-${stage}-admin-list-users` - GET /admin/users
6. `chme-${stage}-admin-stats-overview` - GET /admin/stats/overview

---

## 🚀 배포 순서

### 1. 파일 복사
```powershell
cd C:\chum7\infra

# stacks 폴더 생성 (없으면)
mkdir stacks

# 6개 파일 복사
# core-stack.ts → stacks/core-stack.ts
# auth-stack.ts → stacks/auth-stack.ts
# challenge-stack.ts → stacks/challenge-stack.ts
# verification-stack.ts → stacks/verification-stack.ts
# cheer-stack.ts → stacks/cheer-stack.ts
# admin-stack.ts → stacks/admin-stack.ts
```

### 2. 의존성 확인
```powershell
cd C:\chum7\infra
npm install
```

### 3. CDK Synth 테스트 (DEV)
```powershell
npx cdk synth --context stage=dev
```

에러 없으면 성공! ✅

### 4. Bootstrap (최초 1회)
```powershell
cdk bootstrap aws://532393804562/ap-northeast-2
```

### 5. DEV 배포
```powershell
# 전체 배포
npx cdk deploy --all --context stage=dev

# 또는 개별 배포
npx cdk deploy chme-dev-core --context stage=dev
npx cdk deploy chme-dev-auth --context stage=dev
npx cdk deploy chme-dev-challenge --context stage=dev
npx cdk deploy chme-dev-verification --context stage=dev
npx cdk deploy chme-dev-cheer --context stage=dev
npx cdk deploy chme-dev-admin --context stage=dev
```

---

## 📊 총 생성되는 리소스

### DEV 환경
```
✅ 6개 Stack
✅ 28개 Lambda 함수
✅ 6개 DynamoDB 테이블
✅ 1개 API Gateway
✅ 1개 Cognito User Pool
✅ 1개 SNS Topic
✅ 1개 EventBridge Bus
✅ 1개 EventBridge Rule (1분마다)
```

### PROD 환경
```
동일 (prefix만 prod로)
```

---

## ⚠️ 주의사항

### 1. Lambda 함수 코드 필요
각 Stack은 Lambda 함수 경로를 참조합니다:
```typescript
entry: path.join(__dirname, '../../backend/services/auth/register/index.ts')
```

→ **backend 폴더에 Lambda 함수 코드가 있어야 합니다!**

### 2. Runtime
모든 Lambda는 Node.js 24.x 사용:
```typescript
runtime: Runtime.NODEJS_24_X
```

로컬 Node 25.6.1이어도 Lambda는 24.x로 실행됨 ✅

### 3. S3 버킷
CoreStack에서 기존 버킷 참조:
```typescript
this.uploadsBucket = Bucket.fromBucketName(
  this,
  'UploadsBucket',
  config.s3.uploadsBucket  // chum7-dev-uploads
);
```

→ 버킷이 이미 존재해야 함 ✅

### 4. EventBridge Rule
CheerStack은 1분마다 자동 실행:
```typescript
schedule: Schedule.rate(Duration.minutes(1))
```

→ 예약 응원 자동 발송 ⭐

---

## ✅ 체크리스트

- [ ] `stacks/` 폴더 생성
- [ ] 6개 .ts 파일 복사
- [ ] `npm install` 실행
- [ ] `cdk synth --context stage=dev` 테스트
- [ ] `cdk bootstrap` 실행
- [ ] Lambda 함수 코드 준비 (backend 폴더)
- [ ] `cdk deploy --all --context stage=dev` 실행

---

## 🎉 완료!

6개 Stack 파일로 28개 Lambda + 6개 DynamoDB + API Gateway가 자동 배포됩니다!

**복붙만 하면 끝입니다!** 🚀
