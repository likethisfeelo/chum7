# 핵심 데이터 모델

## UserChallenge

사용자가 챌린지에 참여할 때 생성되는 레코드. DynamoDB `USER_CHALLENGES_TABLE`.

```typescript
{
  userChallengeId: string;          // UUID
  userId: string;                   // Cognito sub
  challengeId: string;

  // 참여 상태
  status: 'active' | 'completed' | 'failed';
  phase: 'in_progress' | 'active' | 'preparing' | 'completed' | 'failed';

  // 일정
  startDate: string;                // 'YYYY-MM-DD' - 챌린지 시작일 (캘린더 Day 계산 기준)
  currentDay: number;               // 마지막 인증 후 day+1 저장 (UI 표시에 직접 사용 금지)

  // 진행도
  progress: ProgressEntry[];        // Day별 인증 상태 배열
  score: number;                    // 누적 점수

  // 설정
  timezone: string;                 // 'Asia/Seoul'
  remedyPolicy: RemedyPolicy;

  // 참조
  challenge: ChallengeSnapshot;     // challengeType 등 챌린지 메타 포함

  createdAt: string;
  updatedAt: string;
}
```

---

## ProgressEntry

`UserChallenge.progress` 배열의 각 항목.

```typescript
{
  day: number;                      // 1~7 (또는 durationDays까지)
  status: 'success' | 'partial' | 'failed' | 'skipped' | 'pending';
  verificationId?: string;          // 완료된 인증 ID (단일 퀘스트형)

  // 퀘스트별 완료 플래그 (혼합형 지원을 위해 추가)
  leaderQuestDone: boolean;
  personalQuestDone: boolean;
  leaderVerificationId?: string;    // leader 퀘스트 인증 ID
  personalVerificationId?: string;  // personal 퀘스트 인증 ID

  timestamp: string;                // 마지막 업데이트 시각
  delta: number;                    // 점수 변화
  score: number;                    // 획득 점수
  remedied?: boolean;               // 보완 인증 여부
}
```

### status 값 의미

| status | 의미 |
|--------|------|
| `success` | 당일 완료 (모든 퀘스트 충족) |
| `partial` | 혼합형에서 1개 퀘스트만 완료, 나머지 미완 |
| `failed` | 당일 미인증 (Day 경과 후 미완) |
| `skipped` | 건너뜀 |
| `pending` | 아직 해당 day 미도달 |

---

## Verification

인증 게시물 레코드. DynamoDB `VERIFICATIONS_TABLE`.

```typescript
{
  verificationId: string;           // UUID
  userId: string;
  userChallengeId: string;
  challengeId: string;

  day: number;                      // 인증한 챌린지 day
  type: 'submit' | 'remedy' | 'extra';
  questType: 'leader' | 'personal' | null;  // 신규 추가

  // 미디어
  imageUrl?: string;
  verificationType: 'image' | 'text' | 'link' | 'video';
  mediaValidationStatus?: 'pending' | 'valid' | 'invalid';

  // 내용
  todayNote: string;
  tomorrowPromise?: string;
  reflectionNote?: string;          // remedy 전용

  // 시각
  performedAt: string;              // 사용자 선택 실천 시각 (ISO)
  uploadAt: string;                 // 서버 수신 시각
  certDate: string;                 // 'YYYY-MM-DD' 인증 날짜 (타임존 적용)

  // 점수
  score: number;
  scoreEarned: number;
  delta: number;

  // 공개 여부
  isPublic: 'true' | 'false';
  isPersonalOnly: boolean;          // true = 나만 보기
  isAnonymous: boolean;
  isExtra: boolean;

  cheerCount: number;
  createdAt: string;
}
```

---

## Challenge

챌린지 정의 레코드. DynamoDB `CHALLENGES_TABLE`.

```typescript
{
  challengeId: string;
  title: string;
  description: string;
  category: string;
  targetTime: string;               // 'HH:MM'
  identityKeyword: string;
  badgeIcon: string;
  badgeName: string;

  // 유형
  challengeType: 'leader_only' | 'personal_only' | 'leader_personal' | 'mixed';
  personalQuestEnabled: boolean;    // challengeType에서 자동 결정

  // 일정
  lifecycle: 'draft' | 'recruiting' | 'preparing' | 'active' | 'completed' | 'archived';
  recruitingStartAt: string;
  recruitingEndAt: string;
  challengeStartAt: string;
  challengeEndAt: string;
  durationDays: number;             // 기본 7일

  // 정책
  maxParticipants: number | null;
  layerPolicy: {
    requirePersonalGoalOnJoin: boolean;
    requirePersonalTargetOnJoin: boolean;
    allowExtraVisibilityToggle: boolean;
  };
  defaultRemedyPolicy: RemedyPolicy;
  allowedVerificationTypes: string[];
  joinApprovalRequired: boolean;
  personalQuestAutoApprove: boolean;

  // 통계
  stats: {
    totalParticipants: number;
    activeParticipants: number;
    completionRate: number;
    averageDelta: number;
  };

  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
```

---

## RemedyPolicy

```typescript
{
  type: 'strict' | 'limited' | 'open';
  maxRemedyDays: number | null;     // limited일 때만 유효 (1 또는 2)
  allowBulk: boolean | null;        // open일 때만 유효
}
```

| type | 의미 |
|------|------|
| `strict` | 보완 불가 |
| `limited` | 최대 N일까지만 보완 가능 |
| `open` | 제한 없이 보완 가능 |

---

## CheerTicket

응원권 레코드. DynamoDB `USER_CHEER_TICKETS_TABLE`.

```typescript
{
  ticketId: string;
  userId: string;
  source: 'submit' | 'remedy';
  challengeId: string;
  verificationId: string;
  delta: number;
  status: 'available' | 'used';
  usedAt: string | null;
  usedForCheerId: string | null;
  expiresAt: string;                // 발급 당일 23:59:59
  expiresAtTimestamp: number;
  createdAt: string;
}
```
