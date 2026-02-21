# CHME (chum7) — Claude Code 작업 지시서

> 이 문서는 Claude Code(터미널 에이전트)에게 전달하는 프로젝트 컨텍스트 및 작업 규칙입니다.
> 코딩 또는 작업 시작 전, 반드시 작업 과정을 설명하고 확인을 받은 뒤 진행하세요.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 프로젝트명 | CHME (Challenge Earth with ME) |
| 도메인 | chum7.com (변경됨, challengeus.me 아님) |
| 서비스 유형 | 7일 습관 챌린지 플랫폼 (PWA 웹앱) |
| AWS 계정 ID | 532393804562 |
| 주요 리전 | ap-northeast-2 (서울) |

### 서비스 핵심 기능
1. **인증 시스템** — 매일 챌린지 완료 인증 (텍스트 필수, 사진 선택). 델타(Δ) = 목표 시간 - 실제 완료 시간
2. **Day 6 보완 시스템** — Day 1~5 중 1회 실패 시 Day 6에 보완 인증 가능 (70% 점수)
3. **스마트 응원 시스템** — 델타 기반 즉시/예약 응원 발송. 예약 발송 시간 = 수신자 목표 시간 - 발신자 델타
4. **정체성/뱃지 시스템** — 챌린지 완주 시 뱃지 획득

### 사용자 역할 구분
- **일반 사용자**: 챌린지 참여, 인증, 응원, 피드 조회
- **관리자**: 챌린지 생성/관리, 사용자 관리, 통계 조회 (Cognito "admins" 그룹)

---

## 2. 기술 스택

### 프론트엔드
```
Runtime:    Node.js 24.x
Framework:  React 18.3 + Vite 5.x
Language:   TypeScript
Styling:    Tailwind CSS 3.4
State:      Zustand 4.x
Data:       TanStack Query 5.x
Routing:    React Router 6.x
Animation:  Framer Motion 11.x
Icons:      React Icons 5.x
```

### 백엔드
```
Runtime:    Node.js 24.x (Lambda)
API:        API Gateway (HTTP API)
DB:         DynamoDB (NoSQL, 6개 테이블)
Storage:    S3 + CloudFront
Auth:       AWS Cognito
Push:       AWS SNS
Scheduler:  EventBridge (예약 응원)
IAM Role:   chum7_lambda_first (기존 역할 사용)
            ARN: arn:aws:iam::532393804562:role/chum7_lambda_first
```

### 인프라
```
IaC:        AWS CDK (TypeScript)
CI/CD:      수동 PowerShell 스크립트
Monitoring: CloudWatch
```

---

## 3. 환경 구성

### DEV 환경
| 리소스 | 값 |
|--------|-----|
| Web URL | test.chum7.com |
| API URL | dev.chum7.com |
| S3 Static | chme-dev |
| S3 Uploads | chum7-dev-uploads |
| Lambda 접두사 | chme-dev-{기능명} |
| DynamoDB 접두사 | chme-dev-{테이블명} |

### PROD 환경
| 리소스 | 값 |
|--------|-----|
| Web URL | www.chum7.com |
| API URL | api.chum7.com |
| S3 Static | chum7-prod-static |
| S3 Uploads | chum7-prod-uploads |
| Lambda 접두사 | chme-prod-{기능명} |
| DynamoDB 접두사 | chme-prod-{테이블명} |

> **현재는 DEV 환경만 작업. PROD는 베타 완료 후 전환.**

---

## 4. 프로젝트 디렉토리 구조

```
C:\chum7\
├── frontend/               # 일반 사용자 React 앱 (69개 파일 완성)
│   └── src/features/
│       ├── auth/
│       ├── challenge/
│       ├── verification/
│       ├── cheer/
│       ├── feed/
│       ├── badge/
│       └── profile/
├── admin-frontend/         # 관리자 React 앱
├── backend/
│   └── services/
│       ├── auth/           # 5개 Lambda (완성)
│       ├── challenge/      # 5개 Lambda
│       ├── verification/   # 5개 Lambda (완성)
│       ├── cheer/          # 10개 Lambda (완성)
│       └── admin/          # 6개 Lambda (완성)
├── infra/                  # CDK 스택
│   └── stacks/
│       ├── auth-stack.ts
│       ├── challenge-stack.ts
│       ├── verification-stack.ts
│       ├── cheer-stack.ts
│       ├── feed-stack.ts
│       └── badge-stack.ts
└── scripts/
    ├── deploy-dev.ps1
    └── deploy-prod.ps1
```

---

## 5. DynamoDB 테이블 (6개)

| 테이블명 (DEV) | 파티션 키 | 용도 |
|----------------|-----------|------|
| chme-dev-users | userId (S) | 사용자 정보, 응원권, 통계 |
| chme-dev-challenges | challengeId (S) | 챌린지 목록 |
| chme-dev-userChallenges | userChallengeId (S) | 사용자별 챌린지 진행 |
| chme-dev-verifications | verificationId (S) | 인증 기록, 델타값 |
| chme-dev-cheers | cheerId (S) | 응원 기록 (즉시/예약) |
| chme-dev-userCheerTickets | ticketId (S) | 응원권 관리 |

---

## 6. Lambda 함수 목록 (28개)

### Auth (5개)
- chme-dev-auth-register
- chme-dev-auth-login
- chme-dev-auth-refresh-token
- chme-dev-auth-logout
- chme-dev-auth-get-profile

### Challenge (5개)
- chme-dev-challenge-list
- chme-dev-challenge-detail
- chme-dev-challenge-join
- chme-dev-challenge-my-list
- chme-dev-challenge-leave

### Verification (5개)
- chme-dev-verification-submit      ← 핵심: Δ 계산, 응원 기회 감지
- chme-dev-verification-get
- chme-dev-verification-upload-url  ← S3 Presigned URL 생성
- chme-dev-verification-remedy      ← Day 6 보완
- chme-dev-verification-list

### Cheer (10개)
- chme-dev-cheer-send-immediate     ← 즉시 응원 발송
- chme-dev-cheer-use-ticket         ← 예약 응원 생성
- chme-dev-cheer-send-scheduled     ← EventBridge 트리거용
- chme-dev-cheer-get-targets        ← 응원 가능 대상 조회
- chme-dev-cheer-thank              ← 감사 반응
- chme-dev-cheer-my-tickets
- chme-dev-cheer-received
- chme-dev-cheer-sent
- chme-dev-cheer-stats
- chme-dev-cheer-cancel-scheduled

### Admin (6개)
- chme-dev-admin-challenge-create
- chme-dev-admin-challenge-update
- chme-dev-admin-challenge-delete
- chme-dev-admin-user-list
- chme-dev-admin-stats
- chme-dev-admin-dashboard

---

## 7. 핵심 비즈니스 로직

### 델타(Δ) 계산
```
Δ = targetTime - actualCompletionTime (분 단위)
Δ > 0: 일찍 완료 (응원 기회 발생)
Δ <= 0: 늦게 완료 또는 미완료
```

### 응원 발송 시간 계산
```
예약 응원 발송 시간 = 수신자 목표 시간 - 발신자 델타(분)
예시: 수신자 목표 07:00, 발신자 델타 15분 → 06:45에 자동 발송
```

### 응원권 획득 조건
```
✅ 목표 시간 내 완료 + 미완료자 없음 → 응원권 1장
✅ 3일 연속 성공 → 응원권 1장 (보너스)
✅ Day 6 보완 성공 → 응원권 1장 (보너스)
✅ 챌린지 완주 (Day 7) → 응원권 3장 (보너스)
```

### 점수 시스템
```
일반 인증 성공: 10점
Day 6 보완 인증: 7점 (70%)
델타 보너스 없음 (델타는 응원 시스템에만 활용)
```

---

## 8. 리소스 네이밍 규칙 (절대 준수)

```
DynamoDB:   chme-{stage}-{tableName}
Lambda:     chme-{stage}-{feature}-{action}
S3:         chme-{stage}-static / chum7-{stage}-uploads
API GW:     chme-{stage}-api
CFStack:    chme-{stage}-{stackName}

stage = dev | prod
```
**스테이지 이름이 없는 리소스는 생성하지 않는다.**

---

## 9. 작업 규칙 (필수 준수)

### 9-1. 시작 전 확인
```
모든 코딩 또는 작업 시작 전:
1. 작업 과정(순서, 변경 파일, 예상 결과)을 먼저 설명
2. Dark(사용자)의 확인을 받은 뒤 진행
3. 확인 없이 코드 작성 금지
```

### 9-2. 개발 철학
```
기능 완성 기준 (4가지 모두 충족):
✅ Lambda 단독 로컬 테스트 완료
✅ DEV 배포 후 실제 URL에서 호출 가능
✅ DynamoDB에 실제 데이터 저장 확인
✅ 프론트에서 API 연동까지 확인
→ 4가지 미충족 시 "완성" 아님
```

### 9-3. TypeScript 안전 원칙
```
✅ defaultValue 사용 금지 (타입 충돌 원인)
✅ 타입 충돌 방지 (제네릭 명시)
✅ 안전한 string length 계산 (옵셔널 체이닝)
✅ props spreading 순서 준수 ({...props} 마지막)
```

### 9-4. 환경 변수
```
STAGE=dev
USERS_TABLE=chme-dev-users
CHALLENGES_TABLE=chme-dev-challenges
USER_CHALLENGES_TABLE=chme-dev-userChallenges
VERIFICATIONS_TABLE=chme-dev-verifications
CHEERS_TABLE=chme-dev-cheers
CHEER_TICKETS_TABLE=chme-dev-userCheerTickets
USER_POOL_ID=ap-northeast-2_XXXXXXXXX   ← 실제값 확인 필요
COGNITO_CLIENT_ID=XXXXXXXXX             ← 실제값 확인 필요
S3_UPLOADS_BUCKET=chum7-dev-uploads
CLOUDFRONT_URL=https://test.chum7.com
```

### 9-5. 배포 방식
```
Lambda 배포: PowerShell 명령 (스크립트 아닌 개별 명령어)
프론트 배포: npm run build → S3 sync → CloudFront invalidation
CDK 배포: npx cdk deploy chme-dev-{stack} --context stage=dev
IAM Role: arn:aws:iam::532393804562:role/chum7_lambda_first (기존 사용)
```

---

## 10. 현재 진행 상태

### 완료된 항목 (85%)
- [x] 프론트엔드 전체 구조 (69개 파일, React + TypeScript)
- [x] Auth Lambda 5개
- [x] Verification Lambda 5개  
- [x] Cheer Lambda 10개
- [x] Admin Lambda 6개
- [x] AWS 인프라 (S3, CloudFront, Route53, Cognito, ACM)
- [x] DEV/PROD 도메인 설정 (chum7.com)

### 남은 작업 (15%)
- [ ] Challenge Lambda 5개 배포
- [ ] CDK 스택 최종 배포 (infra/)
- [ ] DynamoDB 테이블 생성 확인
- [ ] API Gateway 라우트 연결
- [ ] 프론트엔드 DEV 환경 연동 테스트
- [ ] Feed Lambda (Phase 2)
- [ ] Badge Lambda (Phase 2)

---

## 11. 참고 API 명세 (핵심)

### 인증 제출 (핵심 엔드포인트)
```
POST /verifications
{
  userChallengeId, day, imageUrl, todayNote,
  tomorrowPromise, completedAt, targetTime,
  isPublic, isAnonymous
}
Response:
{
  verificationId, delta, scoreEarned,
  cheerOpportunity: {
    hasIncompletePeople, incompleteCount,
    canCheerNow, cheerTicketGranted
  },
  newBadges, message
}
```

### 즉시 응원
```
POST /cheers/immediate
{ senderId, receiverIds, message, senderDelta }
```

### 예약 응원 (응원권 사용)
```
POST /cheers/tickets/use
{ ticketId, receiverId, message, receiverTargetTime }
// scheduledTime = receiverTargetTime - senderDelta (자동 계산)
```

---

## 12. 자주 발생하는 문제 해결

### CDK 배포 실패
```powershell
npx cdk destroy chme-dev-{stack} --force
npx cdk deploy chme-dev-{stack} --context stage=dev
```

### CORS 에러
```typescript
// API Gateway corsPreflight 설정 확인
allowOrigins: ['https://test.chum7.com', 'https://www.chum7.com']
```

### Lambda 로그 확인
```bash
aws logs tail /aws/lambda/chme-dev-{functionName} --follow
```

---

*문서 버전: 1.0 | 작성일: 2026-02-21 | 기반: 과거 대화 전체 검토*
