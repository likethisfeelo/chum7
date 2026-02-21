# CHME 백엔드 구축 완전 가이드

## 📋 개요

CHME 서비스의 전체 백엔드 인프라와 Lambda 함수를 구축하는 가이드입니다.

---

## 🏗️ 아키텍처 구성

### 스택 구조 (총 6개)

```
1. chme-{stage}-core        → API Gateway, Cognito, S3, SNS, EventBridge
2. chme-{stage}-dynamodb    → DynamoDB 6개 테이블
3. chme-{stage}-auth        → 회원가입, 로그인, 프로필
4. chme-{stage}-challenge   → 챌린지 탐색, 참여, 관리
5. chme-{stage}-verification → 인증 제출, 델타 계산, 스마트 응원 감지
6. chme-{stage}-cheer       → 즉시 응원, 예약 응원, 자동 발송
```

---

## 📂 파일 구조

```
chme/
├── infra/
│   ├── bin/
│   │   └── chme.ts                    # CDK 앱 진입점 ⭐
│   ├── config/
│   │   ├── dev.ts                     # DEV 설정
│   │   ├── prod.ts                    # PROD 설정
│   │   └── index.ts                   # Config export
│   ├── stacks/
│   │   ├── core-stack.ts              # ⭐ 핵심 인프라
│   │   ├── dynamodb-stack.ts          # ⭐ DynamoDB 6개 테이블
│   │   ├── auth-stack.ts              # Auth Lambda 5개
│   │   ├── challenge-stack.ts         # Challenge Lambda 5개
│   │   ├── verification-stack.ts      # ⭐ Verification Lambda 5개
│   │   └── cheer-stack.ts             # ⭐ Cheer Lambda 7개
│   ├── package.json
│   ├── tsconfig.json
│   └── cdk.json
│
├── backend/
│   ├── services/
│   │   ├── auth/
│   │   │   ├── register/index.ts      # ✅ 회원가입
│   │   │   ├── login/index.ts
│   │   │   ├── refresh-token/index.ts
│   │   │   ├── get-profile/index.ts
│   │   │   └── update-profile/index.ts
│   │   │
│   │   ├── challenge/
│   │   │   ├── list/index.ts
│   │   │   ├── detail/index.ts
│   │   │   ├── join/index.ts
│   │   │   ├── my-challenges/index.ts
│   │   │   └── stats/index.ts
│   │   │
│   │   ├── verification/
│   │   │   ├── submit/index.ts        # ⭐ 인증 제출 (델타 계산)
│   │   │   ├── get/index.ts
│   │   │   ├── list/index.ts
│   │   │   ├── upload-url/index.ts
│   │   │   └── remedy/index.ts        # Day 6 보완
│   │   │
│   │   └── cheer/
│   │       ├── send-immediate/index.ts # ⭐ 즉시 응원
│   │       ├── use-ticket/index.ts     # ⭐ 응원권 사용
│   │       ├── send-scheduled/index.ts # ⭐ 자동 발송
│   │       ├── get-targets/index.ts
│   │       ├── thank/index.ts
│   │       ├── get-my-cheers/index.ts
│   │       └── get-scheduled/index.ts
│   │
│   └── shared/
│       └── lib/
│           ├── db.ts                  # DynamoDB 헬퍼
│           ├── s3.ts                  # ✅ S3 헬퍼 (업데이트됨)
│           ├── cognito.ts
│           ├── sns.ts
│           └── eventbridge.ts
│
└── frontend/
    ├── .env.dev                       # ✅ DEV 환경 변수
    └── .env.prod                      # ✅ PROD 환경 변수
```

---

## 🗄️ DynamoDB 테이블 구조

### 1. Users 테이블
```
PK: userId (String)
GSI: email-index (email)

Attributes:
- userId, email, name, profileImageUrl
- identityPhrase, level, exp, animalIcon
- cheerTickets (응원권 개수)
- stats (completedChallenges, totalVerifications, etc.)
```

### 2. Challenges 테이블
```
PK: challengeId (String)
GSI: category-index (category + createdAt)

Attributes:
- challengeId, title, description, category
- targetTime, identityKeyword, badgeIcon, badgeName
- stats (totalParticipants, completionRate, etc.)
```

### 3. UserChallenges 테이블
```
PK: userChallengeId (String)
GSI: userId-index (userId + startDate)
GSI: groupId-index (groupId + userId) ⭐ 스마트 응원용
GSI: challengeId-index (challengeId + startDate)

Attributes:
- userChallengeId, userId, challengeId
- startDate, status, currentDay
- progress[] (Day별 인증 상태)
- score, deltaSum, cheerCount, groupId
```

### 4. Verifications 테이블
```
PK: verificationId (String)
GSI: userChallengeId-index (userChallengeId + day)
GSI: userId-index (userId + createdAt)
GSI: public-feed-index (isPublic + createdAt)

Attributes:
- verificationId, userId, userChallengeId
- day, type (normal/remedy), imageUrl
- todayNote, tomorrowPromise
- completedAt, targetTime, delta ⭐
- score, cheerCount, isPublic, isAnonymous
```

### 5. Cheers 테이블
```
PK: cheerId (String)
GSI: senderId-index (senderId + createdAt)
GSI: receiverId-index (receiverId + createdAt)
GSI: scheduled-index (status + scheduledTime) ⭐

Attributes:
- cheerId, senderId, receiverId
- cheerType (immediate/scheduled)
- message, senderDelta ⭐
- scheduledTime, status (pending/sent/failed)
- isRead, isThanked, thankedAt
```

### 6. UserCheerTickets 테이블
```
PK: ticketId (String)
GSI: userId-status-index (userId + status)
GSI: status-expires-index (status + expiresAt)
TTL: expiresAtTimestamp

Attributes:
- ticketId, userId, source
- delta ⭐ (응원 발송 시간 계산용)
- status (available/used/expired)
- usedAt, usedForCheerId
- expiresAt, expiresAtTimestamp
```

---

## 🚀 배포 절차

### 1. 사전 준비

```bash
# AWS CLI 설정
aws configure

# Node.js 24.x 설치 확인
node --version

# CDK 설치
npm install -g aws-cdk

# AWS Account ID 설정
export AWS_ACCOUNT_ID="YOUR_ACCOUNT_ID"
```

### 2. 프로젝트 초기화

```bash
# 프로젝트 루트에서
cd infra
npm install

# CDK Bootstrap (최초 1회)
cdk bootstrap aws://$AWS_ACCOUNT_ID/ap-northeast-2
```

### 3. 환경 변수 설정

**infra/config/dev.ts**
```typescript
account: process.env.AWS_ACCOUNT_ID || 'YOUR_ACCOUNT_ID'
```

**frontend/.env.dev**
```env
# Cognito User Pool ID와 Client ID는 Core Stack 배포 후 업데이트
VITE_COGNITO_USER_POOL_ID=ap-northeast-2_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
```

### 4. DEV 환경 배포

```bash
cd infra

# 전체 스택 배포 (순차적으로)
cdk deploy chme-dev-core --context stage=dev
cdk deploy chme-dev-dynamodb --context stage=dev
cdk deploy chme-dev-auth --context stage=dev
cdk deploy chme-dev-challenge --context stage=dev
cdk deploy chme-dev-verification --context stage=dev
cdk deploy chme-dev-cheer --context stage=dev

# 또는 한 번에 배포
cdk deploy --all --context stage=dev
```

### 5. Cognito User Pool ID 업데이트

배포 완료 후 출력된 값들을 환경 변수에 업데이트:

```bash
# Outputs에서 확인
UserPoolId = ap-northeast-2_ABC123
UserPoolClientId = 1234567890abcdefghijklmnop

# .env.dev 파일 업데이트
VITE_COGNITO_USER_POOL_ID=ap-northeast-2_ABC123
VITE_COGNITO_CLIENT_ID=1234567890abcdefghijklmnop
```

### 6. 테스트

```bash
# API Gateway 엔드포인트 확인
aws apigateway get-rest-apis --region ap-northeast-2

# 헬스 체크
curl https://dev.chum7.com/health

# 회원가입 테스트
curl -X POST https://dev.chum7.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234!",
    "name": "Test User"
  }'
```

### 7. PROD 환경 배포

DEV 테스트 완료 후:

```bash
# PROD 배포
cdk deploy --all --context stage=prod

# 확인 필요
# Type 'DEPLOY' to continue
```

---

## 🔑 핵심 Lambda 함수 설명

### 1. Verification Submit ⭐ (가장 중요!)

**경로**: `backend/services/verification/submit/index.ts`

**기능**:
1. 인증 제출 처리
2. 델타(Δ) 계산: `목표 시간 - 완료 시간`
3. 같은 그룹의 미완료자 확인
4. **응원 기회 감지**:
   - 미완료자 있음 → `canCheerNow: true` (즉시 응원 가능)
   - 미완료자 없음 → 응원권 1장 생성
5. 보너스 응원권:
   - 3일 연속 → 응원권 1장
   - Day 7 완주 → 응원권 3장

**응답 예시**:
```json
{
  "success": true,
  "message": "Day 3 완료! 목표보다 15분 일찍!",
  "data": {
    "verificationId": "uuid-123",
    "day": 3,
    "delta": 15,
    "isEarlyCompletion": true,
    "scoreEarned": 10,
    "totalScore": 30,
    "consecutiveDays": 3,
    "cheerOpportunity": {
      "hasIncompletePeople": true,
      "incompleteCount": 3,
      "canCheerNow": true,
      "cheerTicketGranted": false
    },
    "newBadges": ["3-day-streak"]
  }
}
```

### 2. Cheer Send Immediate ⭐

**경로**: `backend/services/cheer/send-immediate/index.ts`

**기능**:
1. 여러 수신자에게 즉시 응원 발송
2. Cheers 테이블에 저장 (`cheerType: immediate`)
3. SNS 푸시 알림 발송

**사용 시점**:
- Verification 완료 후 `canCheerNow: true`일 때
- 사용자가 "지금 응원 보내기" 클릭

### 3. Cheer Use Ticket ⭐

**경로**: `backend/services/cheer/use-ticket/index.ts`

**기능**:
1. 응원권 사용하여 예약 응원 생성
2. **발송 시간 계산**:
   ```
   scheduledTime = receiverTargetTime - senderDelta
   
   예시:
   - 수신자 목표: 07:00
   - 발신자 델타: 15분
   - 발송 시간: 06:45
   ```
3. EventBridge 스케줄 등록
4. Cheers 테이블에 저장 (`status: pending`)

### 4. Cheer Send Scheduled ⭐

**경로**: `backend/services/cheer/send-scheduled/index.ts`

**기능**:
1. EventBridge에서 매분마다 호출
2. 현재 시간에 발송할 응원 조회 (`scheduled-index` GSI)
3. 푸시 알림 발송
4. 상태 업데이트 (`pending` → `sent`)

---

## 🎯 스마트 응원 시스템 플로우

### 즉시 응원 플로우

```
1. User A: 06:45에 인증 완료 (목표 07:00)
   └→ Δ = +15분

2. Verification Submit Lambda:
   └→ 같은 그룹 미완료자 확인
       └→ 3명 발견

3. 응답:
   {
     "cheerOpportunity": {
       "hasIncompletePeople": true,
       "incompleteCount": 3,
       "canCheerNow": true
     }
   }

4. Frontend:
   └→ "응원 보내기" 팝업 표시

5. User A: 메시지 선택 후 전송
   └→ POST /cheers/immediate

6. Cheer Send Immediate Lambda:
   └→ 3명에게 즉시 응원 발송
   └→ SNS 푸시 알림
```

### 예약 응원 플로우

```
1. User A: 06:45에 인증 완료 (목표 07:00)
   └→ Δ = +15분

2. Verification Submit Lambda:
   └→ 같은 그룹 미완료자 없음

3. 응원권 1장 생성:
   {
     "ticketId": "ticket-123",
     "delta": 15,
     "source": "early_completion",
     "status": "available"
   }

4. [다음날]
   User A: ME 탭에서 "응원권 사용하기"

5. 대상 선택:
   - User B (목표: 07:00)

6. POST /cheers/tickets/use:
   {
     "ticketId": "ticket-123",
     "receiverId": "user-B-id",
     "receiverTargetTime": "2024-01-22T07:00:00Z"
   }

7. Cheer Use Ticket Lambda:
   └→ 발송 시간 계산: 07:00 - 15분 = 06:45
   └→ Cheers 테이블 저장 (status: pending)
   └→ EventBridge 스케줄 등록

8. [06:45 정각]
   EventBridge → Cheer Send Scheduled Lambda
   └→ 푸시 알림: "🐻님이 응원을 보냈어요! 15분 남았어요 💪"
   └→ 상태 업데이트: pending → sent
```

---

## 📊 API 엔드포인트 목록

### Auth (5개)
```
POST   /auth/register         회원가입
POST   /auth/login            로그인
POST   /auth/refresh          토큰 갱신
GET    /auth/profile          프로필 조회
PUT    /auth/profile          프로필 수정
```

### Challenge (5개)
```
GET    /challenges            챌린지 목록
GET    /challenges/{id}       챌린지 상세
POST   /challenges/{id}/join  챌린지 참여
GET    /challenges/my         내 챌린지
GET    /challenges/{id}/stats 챌린지 통계
```

### Verification (5개)
```
POST   /verifications         인증 제출 ⭐
GET    /verifications/{id}    인증 상세
GET    /verifications         인증 목록
POST   /verifications/upload-url  업로드 URL
POST   /verifications/remedy  Day 6 보완
```

### Cheer (7개)
```
POST   /cheers/immediate      즉시 응원 ⭐
POST   /cheers/tickets/use    응원권 사용 ⭐
GET    /cheers/targets        응원 대상 조회
POST   /cheers/{id}/thank     응원 감사
GET    /cheers/my             내 응원
GET    /cheers/scheduled      예약 응원 목록
```

---

## 🔧 로컬 개발

### Lambda 로컬 테스트

```bash
cd backend/services/auth/register
npm install
npm test

# 또는 직접 실행
node -e "
const { handler } = require('./index');
handler({
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'Test1234!',
    name: 'Test'
  })
}).then(console.log);
"
```

### DynamoDB Local

```bash
docker run -p 8000:8000 amazon/dynamodb-local

# 환경 변수 설정
export DYNAMODB_ENDPOINT=http://localhost:8000
```

---

## 🐛 트러블슈팅

### 1. CDK 배포 실패
```bash
# 스택 삭제 후 재배포
cdk destroy chme-dev-auth
cdk deploy chme-dev-auth --context stage=dev
```

### 2. Lambda Cold Start 느림
```typescript
// Provisioned Concurrency 설정 (PROD만)
const lambda = new Function(this, 'Function', {
  reservedConcurrentExecutions: 5
});
```

### 3. DynamoDB GSI 쿼리 실패
```bash
# 인덱스 확인
aws dynamodb describe-table \
  --table-name chme-dev-user-challenges \
  --query 'Table.GlobalSecondaryIndexes'
```

---

## ✅ 배포 체크리스트

### DEV 환경
- [ ] Core Stack 배포
- [ ] DynamoDB Stack 배포
- [ ] Auth Stack 배포
- [ ] Challenge Stack 배포
- [ ] Verification Stack 배포
- [ ] Cheer Stack 배포
- [ ] Cognito User Pool ID 업데이트
- [ ] API 테스트 (회원가입, 로그인)
- [ ] 인증 제출 테스트 (델타 계산)
- [ ] 응원 시스템 테스트 (즉시, 예약)

### PROD 환경
- [ ] DEV 테스트 완료
- [ ] 환경 변수 PROD 업데이트
- [ ] 전체 스택 PROD 배포
- [ ] CloudWatch Logs 확인
- [ ] CloudWatch Alarms 설정 확인
- [ ] 모니터링 대시보드 구성

---

## 📈 다음 단계

1. **Feed Stack** (Phase 2)
   - 어제의 영웅들
   - 공개 피드
   - Day 6 현황

2. **Badge Stack** (Phase 2)
   - 자동 뱃지 부여
   - 뱃지 컬렉션

3. **Stats Stack** (Phase 3)
   - 통계 대시보드
   - 챌린지 리포트

---

**이 가이드로 CHME 백엔드 전체를 구축할 수 있습니다!** 🚀
