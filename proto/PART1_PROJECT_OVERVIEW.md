# CHME 프로젝트 전체 코드 모음 (Part 1/3)
## 프로젝트 개요 및 Lambda 함수 목록

---

## 📋 프로젝트 정보

### 프로젝트명
CHME (Challenge Earth with ME / 챌린지어스미)

### 도메인
- **User App (DEV):** test.chum7.com
- **User App (PROD):** www.chum7.com
- **Admin App:** admin.chum7.com
- **API:** api.chum7.com

### AWS 계정 정보
- **Account ID:** 532393804562
- **Region:** ap-northeast-2
- **Lambda Role:** chum7_lambda_first

---

## 🗂️ 전체 폴더 구조

```
C:\chum7\
├── backend/
│   └── services/           # Lambda 함수 28개
│       ├── auth/           # 5개
│       ├── challenge/      # 5개
│       ├── verification/   # 5개
│       ├── cheer/          # 7개
│       └── admin/          # 6개
│
├── infra/                  # CDK Infrastructure
│   ├── bin/
│   │   └── chme.ts
│   ├── config/
│   │   ├── dev.ts
│   │   └── prod.ts
│   └── stacks/
│       ├── core-stack.ts
│       ├── auth-stack.ts
│       ├── challenge-stack.ts
│       ├── verification-stack.ts
│       ├── cheer-stack.ts
│       └── admin-stack.ts
│
├── frontend/               # 사용자 웹앱
│   ├── src/
│   │   ├── app/
│   │   ├── features/
│   │   ├── shared/
│   │   └── stores/
│   └── public/
│
└── admin/                  # 관리자 웹앱
    ├── src/
    │   ├── app/
    │   ├── features/
    │   ├── shared/
    │   └── stores/
    └── public/
```

---

## 🚀 Lambda 함수 목록 (28개)

### Auth (5개)
```
1. chme-dev-auth-register       - 회원가입
2. chme-dev-auth-login          - 로그인
3. chme-dev-auth-refresh        - 토큰 갱신
4. chme-dev-auth-get-profile    - 프로필 조회
5. chme-dev-auth-update-profile - 프로필 수정
```

**환경 변수:**
- STAGE=dev
- USERS_TABLE=chme-dev-users
- USER_POOL_ID=ap-northeast-2_NCbbx3Ilm
- CLIENT_ID=6aalogssb8bb70rtg63a2l7jdb

---

### Challenge (5개)
```
6. chme-dev-challenge-list      - 챌린지 목록
7. chme-dev-challenge-detail    - 챌린지 상세
8. chme-dev-challenge-join      - 챌린지 참여
9. chme-dev-challenge-my        - 내 챌린지
10. chme-dev-challenge-stats    - 통계
```

**환경 변수:**
- STAGE=dev
- CHALLENGES_TABLE=chme-dev-challenges
- USER_CHALLENGES_TABLE=chme-dev-user-challenges

---

### Verification (5개)
```
11. chme-dev-verification-submit     - 인증 제출 (핵심!)
12. chme-dev-verification-get        - 인증 조회
13. chme-dev-verification-list       - 인증 목록
14. chme-dev-verification-upload-url - 이미지 업로드 URL
15. chme-dev-verification-remedy     - Day 6 보완
```

**환경 변수:**
- STAGE=dev
- VERIFICATIONS_TABLE=chme-dev-verifications
- USER_CHALLENGES_TABLE=chme-dev-user-challenges
- USER_CHEER_TICKETS_TABLE=chme-dev-user-cheer-tickets
- UPLOADS_BUCKET=chum7-dev-uploads

---

### Cheer (7개)
```
16. chme-dev-cheer-send-immediate - 즉시 응원
17. chme-dev-cheer-use-ticket     - 응원권 사용
18. chme-dev-cheer-send-scheduled - 예약 응원 발송
19. chme-dev-cheer-get-targets    - 응원 대상 조회
20. chme-dev-cheer-thank          - 감사 표현
21. chme-dev-cheer-get-my         - 내 응원 조회
22. chme-dev-cheer-get-scheduled  - 예약 응원 목록
```

**환경 변수:**
- STAGE=dev
- CHEERS_TABLE=chme-dev-cheers
- USER_CHEER_TICKETS_TABLE=chme-dev-user-cheer-tickets
- USER_CHALLENGES_TABLE=chme-dev-user-challenges

---

### Admin (6개)
```
23. chme-dev-admin-create-challenge - 챌린지 생성
24. chme-dev-admin-update-challenge - 챌린지 수정
25. chme-dev-admin-delete-challenge - 챌린지 삭제
26. chme-dev-admin-toggle-challenge - 활성화/비활성화
27. chme-dev-admin-list-users       - 사용자 목록
28. chme-dev-admin-stats            - 통계 대시보드
```

**환경 변수:**
- STAGE=dev
- CHALLENGES_TABLE=chme-dev-challenges
- USER_CHALLENGES_TABLE=chme-dev-user-challenges
- USERS_TABLE=chme-dev-users

---

## 🗄️ DynamoDB 테이블 (6개)

### 1. chme-dev-users
```
Partition Key: userId (String)
GSI: email-index (email)

속성:
- userId, email, name, profileImageUrl
- level, exp, cheerTickets
- identityPhrase, animalIcon
- stats { completedChallenges, totalVerifications, ... }
- createdAt, updatedAt
```

### 2. chme-dev-challenges
```
Partition Key: challengeId (String)

속성:
- challengeId, title, description, category
- targetTime, identityKeyword
- badgeIcon, badgeName
- stats { totalParticipants, completionRate, ... }
- isActive, createdAt
```

### 3. chme-dev-user-challenges
```
Partition Key: userChallengeId (String)
GSI: userId-index, challengeId-index

속성:
- userChallengeId, userId, challengeId
- startDate, status, currentDay
- progress [{ day, status, verificationId, delta, score }]
- score, deltaSum, cheerCount
- groupId, createdAt
```

### 4. chme-dev-verifications
```
Partition Key: verificationId (String)
GSI: userId-index, userChallengeId-index

속성:
- verificationId, userId, userChallengeId, challengeId
- day, type (normal/remedy)
- imageUrl, todayNote, tomorrowPromise
- completedAt, targetTime, delta, score
- cheerCount, isPublic, isAnonymous
- createdAt
```

### 5. chme-dev-cheers
```
Partition Key: cheerId (String)
GSI: senderId-index, receiverId-index

속성:
- cheerId, senderId, receiverId, verificationId
- cheerType (immediate/scheduled)
- message, senderDelta
- scheduledTime, status (pending/sent/failed)
- isRead, isThanked, thankedAt
- createdAt, sentAt
```

### 6. chme-dev-user-cheer-tickets
```
Partition Key: ticketId (String)
GSI: userId-index

속성:
- ticketId, userId
- source (early_completion/streak_3/remedy/complete)
- challengeId, verificationId, delta
- status (available/used/expired)
- usedAt, usedForCheerId
- expiresAt, createdAt
```

---

## ☁️ AWS 리소스

### S3 Buckets
```
1. chme-dev              - DEV 정적 파일 (CloudFront 연결)
2. chum7-dev-uploads     - DEV 이미지 업로드
3. chme-prod-static      - PROD 정적 파일 (CloudFront 연결)
4. chum7-prod-uploads    - PROD 이미지 업로드
```

### CloudFront Distributions
```
DEV:  ESKW3DS5HUUK9  → test.chum7.com
PROD: E3IIQBS1IN0TFJ → www.chum7.com
```

### Cognito User Pools
```
DEV:  ap-northeast-2_NCbbx3Ilm
      Client: 6aalogssb8bb70rtg63a2l7jdb

PROD: ap-northeast-2_n8ZjUpupj
      Client: 5d62qaq228fap818m8gi8jt759
```

### API Gateway
```
Name: chme-dev-api
Endpoint: api.chum7.com
Type: HTTP API
```

---

## 📦 Lambda 배포 요약

### 공통 설정
```
Runtime: nodejs20.x
Role: arn:aws:iam::532393804562:role/chum7_lambda_first
Timeout: 30초
Memory: 256MB
Region: ap-northeast-2
```

### 공통 Dependencies (package.json)
```json
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.478.0",
    "@aws-sdk/lib-dynamodb": "^3.478.0",
    "@aws-sdk/client-s3": "^3.478.0",
    "@aws-sdk/client-cognito-identity-provider": "^3.478.0",
    "@aws-sdk/client-sns": "^3.478.0",
    "@aws-sdk/s3-request-presigner": "^3.478.0",
    "uuid": "^9.0.1"
  }
}
```

---

## 🎯 배포 순서

### Phase 1: 인프라 구축
```
1. DynamoDB 테이블 6개 생성 (콘솔)
2. S3 Buckets 생성 (콘솔)
3. CloudFront 설정 (콘솔)
4. Cognito User Pool 생성 (콘솔)
```

### Phase 2: Lambda 배포
```
1. Auth Lambda 5개 배포
2. Challenge Lambda 5개 배포
3. Verification Lambda 5개 배포
4. Cheer Lambda 7개 배포
5. Admin Lambda 6개 배포
```

### Phase 3: Frontend 배포
```
1. Frontend 빌드 → S3 업로드
2. Admin 빌드 → S3 업로드
3. CloudFront 캐시 무효화
```

---

## 📝 다음 파일

- **Part 2/3:** CDK Infrastructure 코드 (6개 스택)
- **Part 3/3:** Frontend & Admin 코드 (주요 컴포넌트)

---

## 🔗 주요 파일 목록

Lambda 코드, Infra 코드, Frontend 코드는 다운로드한 ZIP 파일에 포함되어 있습니다:
- `lambda-codes.zip` - 28개 Lambda 함수 코드
- `infra-cdk.zip` - CDK Infrastructure 코드
- `frontend-all.zip` - Frontend & Admin 코드
- `guides-docs.zip` - 배포 가이드 및 문서
