# 응원(Cheer) · 감사(Thank) 시스템 — 최신 설계 문서

> 작성일: 2026-03-22
> 브랜치: `claude/review-challenge-flow-ImEeh`

---

## 1. 개요 및 변경 배경

### 기존 방식의 문제점
응원 점수(thankScore) 적립이 **수신자의 인증 시점**에 일어났다.
즉 `verification/submit` 핸들러 안에서 `grantThankScoreForReceivedCheers`를 호출해
"지금 막 인증 완료한 유저를 응원한 사람들에게 감사 점수를 뿌리는" 방식이었는데,
이는 아래 두 케이스가 얽혀서 의미가 모호해진다는 문제가 있었다.

- 응원 알림이 **아직 발송되지 않은**(pending) 상태인데 수신자가 먼저 인증 완료
- 응원 알림이 **발송된 뒤** 수신자가 인증 완료

### 새 설계 원칙
> **점수 적립과 알림 발송을 완전히 분리한다.**

응원 예약 시간(목표 시간 - delta)이 됐을 때 **`send-scheduled` Lambda 에서만** 두 가지 경우를 판단한다.

| 수신자 상태 | 처리 |
|---|---|
| 이미 인증 완료 | 알림 발송 생략 → 발신자에게 `thankScore + 1` 적립 |
| 아직 미인증 | 기존대로 알림 발송 (수신자에게 push notification) |

---

## 2. 데이터 모델 변경

### CHEERS_TABLE — 변경된 필드

| 필드 | 변경 내용 |
|---|---|
| `status` | `receiver_completed` 값 추가 (수신자 완료 → 발신자 점수 적립됨) |
| `day` | **신규** — 인증 day 번호. `createAutoCheer` 생성 시 저장. `send-scheduled`에서 수신자 완료 여부 조회에 사용 |
| `isThankScoreGranted` | 기존 필드. `receiver_completed` 처리 시 `true`로 업데이트 |
| `thankScoreGrantedAt` | **신규** — 감사 점수 적립 ISO timestamp |

#### cheer.status 전체 상태 흐름

```
pending  ──(send-scheduled: 수신자 미완료)──▶  sent
pending  ──(send-scheduled: 수신자 완료)────▶  receiver_completed
pending  ──(재시도 초과)───────────────────▶  failed  ──▶  dead-letter
```

### USER_CHALLENGES_TABLE — 변경된 필드

| 필드 | 변경 내용 |
|---|---|
| `thankScore` | **신규** — 감사 점수 누적. DynamoDB `ADD` 연산으로 증분 |
| `score` | 기존 — 인증 완료 일수. 변경 없음 |

---

## 3. 백엔드 변경 파일

### 3-1. `backend/services/cheer/send-scheduled/index.ts`

**핵심 추가 함수:**

```ts
// 수신자가 해당 day를 완료했는지 확인
async function isReceiverCompletedToday(
  receiverId: string,
  challengeId: string,
  day: number,
): Promise<boolean>
// USER_CHALLENGES_TABLE의 userId-index GSI 조회
// progress[day].status === 'success' 이면 true
```

```ts
// 발신자에게 감사 점수 적립
async function grantThankScoreToSender(
  senderId: string,
  cheerId: string,
  challengeId: string,
  nowDate: Date,
): Promise<void>
// 1. CHEERS_TABLE: status = 'receiver_completed', isThankScoreGranted = true
// 2. USER_CHALLENGES_TABLE: ADD thankScore :1  (발신자 userChallenge)
```

**메인 루프 분기:**

```ts
const receiverDone = cheer.day != null
  ? await isReceiverCompletedToday(cheer.receiverId, cheer.challengeId, cheer.day)
  : false;

if (receiverDone) {
  await grantThankScoreToSender(...);
  summary.senderScoreGranted += 1;
} else {
  await sendPushNotification(cheer.receiverId, cheer.cheerId);
  // cheer.status = 'sent'
  summary.sent += 1;
}
```

**summary 객체 추가 카운터:** `senderScoreGranted`

---

### 3-2. `backend/services/verification/submit/index.ts`

**제거된 코드:**
- `grantThankScoreForReceivedCheers` 함수 정의 전체
- `isThanksEligible` 변수
- `if (isThanksEligible) { ... }` 블록

**변경된 코드:**
```ts
// createAutoCheer 시그니처에 day 추가
async function createAutoCheer(
  senderId, receiverId, challengeId, day, ...
)

// cheer 생성 객체에 day 필드 포함
{
  cheerType: isImmediate ? "immediate" : "scheduled",
  day,          // ← 신규
  message: null,
  ...
}
```

---

### 3-3. `backend/services/challenge/my-challenges/index.ts`

응답 객체에 `thankScore` 추가:

```ts
{
  score: uc.score,
  thankScore: uc.thankScore ?? 0,  // ← 신규
  ...
}
```

---

### 3-4. `backend/services/admin/cheer/monitor/index.ts` (신규)

`GET /admin/cheer/monitor`

**쿼리 파라미터:**

| 파라미터 | 설명 |
|---|---|
| `challengeId` | 특정 챌린지 필터 (없으면 전체 status별 조회) |
| `status` | 콤마 구분 복수 가능. `pending,sent,receiver_completed,failed` |
| `limit` | 기본 50, 최대 200 |

**응답 구조:**

```json
{
  "success": true,
  "data": {
    "summary": {
      "total": 120,
      "byStatus": { "pending": 40, "sent": 60, "receiver_completed": 20 }
    },
    "pending": [ { cheerId, senderId, receiverId, challengeId, day, scheduledTime, ... } ],
    "sent": [ { cheerId, senderId, receiverId, sentAt, isThankScoreGranted, ... } ],
    "receiverCompleted": [ { cheerId, senderId, receiverId, thankScoreGrantedAt, ... } ],
    "userScores": [ { userId, score, thankScore, consecutiveDays, ... } ]
  }
}
```

**조회 방식:**
- `challengeId` 있음 → `challengeId-index` GSI 조회 + `USER_CHALLENGES` 유저 점수 조회
- `challengeId` 없음 → `scheduled-index` GSI를 status별 각각 조회 후 병합

---

## 4. 인프라 변경

### `infra/stacks/admin-stack.ts`

```ts
const cheerMonitorFn = new NodejsFunction(this, 'CheerMonitorFn', {
  entry: 'backend/services/admin/cheer/monitor/index.ts',
  ...
});
cheersTable.grantReadData(cheerMonitorFn);
userChallengesTable.grantReadData(cheerMonitorFn);

adminApi.root
  .resourceForPath('admin/cheer/monitor')
  .addMethod('GET', new LambdaIntegration(cheerMonitorFn));
```

### `infra/stacks/verification-stack.ts`

- DELETE `/verifications/{verificationId}` 라우트 **제거** (기획 변경 — 삭제 기능 불필요)

---

## 5. 프론트엔드 변경

### 5-1. `frontend/src/features/today/pages/TodayPage.tsx` (재작성)

**제거:**
- 오늘의 인증 섹션 전체 (인증 카드, ··· 메뉴, 삭제 모달)
- `deleteVerificationMutation`, `menuOpenId`, `confirmDeleteId`
- `getTodayVerificationId`, `getChallengeDisplayMeta`, `isVerificationDayCompleted`

**유지/신규:**

| 섹션 | 설명 |
|---|---|
| 받은 응원 (`status=sent`) | 실제 알림이 발송된 응원만 표시 |
| 보낸 응원 (normal cheers) | 본인이 보낸 일반 응원 |
| 🎯 효과적인 응원 (`receiver_completed`) | 수신자가 이미 완료해서 알림 대신 점수로 전환된 응원 |
| 🔔 응원 예약 중 (`pending`) | 아직 발송 전인 예약 응원 |
| thankScore 배너 | `myChallengesData` 집계값 표시 |
| 감사 인사 보낸 목록 | `isThanked=true` 필터 |

---

### 5-2. `frontend/src/features/today/pages/TodayPageDebug.tsx` (간소화)

라우트: `/today/debug`
어두운 모노스페이스 UI (`bg-gray-900`)

**표시 내용:**
- 시스템 상태 패널: `thankScore`, `pendingCount`, `sentCount`, `receiverCompletedCount`
- 챌린지별 점수 (score / thankScore)
- Raw sent cheers 테이블
- Raw received cheers 테이블

**제거:** 인증 섹션, 삭제 코드, `AnimatePresence`, `getChallengeDisplayMeta`

---

### 5-3. `frontend/src/app/App.tsx`

```tsx
import { TodayPageDebug } from '@/features/today/pages/TodayPageDebug';
// ...
<Route path="/today/debug" element={<TodayPageDebug />} />
```

---

### 5-4. `admin-frontend/src/pages/AdminCheerMonitorPage.tsx` (신규)

어드민 응원 모니터 페이지.

**구성:**
- 필터 바: `challengeId` 텍스트 입력 + status 토글 버튼
- 요약 카드 (4개): total / pending / sent / receiver_completed
- 유저 점수 테이블: `thankScore` 내림차순 정렬
- pending 응원 테이블
- sent 응원 테이블
- receiver_completed 응원 테이블

**자동 갱신:** 30초마다 (`refetchInterval: 30_000`)

**상태 배지 색상:**

| status | 색상 |
|---|---|
| `pending` | 노란색 (`bg-yellow-100 text-yellow-700`) |
| `sent` | 초록색 (`bg-green-100 text-green-700`) |
| `receiver_completed` | 파란색 (`bg-blue-100 text-blue-700`) |
| `failed` | 빨간색 (`bg-red-100 text-red-700`) |

### 5-5. `admin-frontend/src/App.tsx`

```tsx
import { AdminCheerMonitorPage } from '@/pages/AdminCheerMonitorPage';

// 사이드바 nav (admins/productowners/leaders/managers)
nav.push({ path: '/admin/cheer/monitor', label: '📣 응원 모니터' });

// 라우트
<Route
  path="/admin/cheer/monitor"
  element={
    <RoleRoute roles={['admins', 'productowners', 'leaders', 'managers']}>
      <Layout><AdminCheerMonitorPage /></Layout>
    </RoleRoute>
  }
/>
```

---

## 6. 전체 흐름 요약

```
[인증 완료]
  └─ verification/submit
       ├─ progress 업데이트
       ├─ createAutoCheer({ day, scheduledTime, ... })  ← day 필드 추가
       └─ (점수 적립 코드 없음)

[EventBridge 5분마다]
  └─ send-scheduled
       └─ CHEERS(status=pending, scheduledTime ≤ now) 조회
            ├─ isReceiverCompletedToday(receiverId, challengeId, day)
            │    ├─ true  → grantThankScoreToSender()
            │    │           cheer.status = receiver_completed
            │    │           sender.userChallenge.thankScore += 1
            │    └─ false → sendPushNotification(receiverId)
            │               cheer.status = sent
            └─ 실패 시 재시도(1,5,15분) → dead-letter
```

---

## 7. 제거된 항목

| 항목 | 이유 |
|---|---|
| `grantThankScoreForReceivedCheers` (verification/submit) | 점수 적립을 send-scheduled로 이관 |
| `isThanksEligible` 변수 | 동일 이유 |
| `DELETE /verifications/{verificationId}` | 기획 변경 — 인증 삭제 기능 불필요 |
| `backend/services/verification/delete/index.ts` | 위와 동일 |
| TodayPage 인증 섹션 UI | 오늘 탭에서 인증 정보 노출 제거 |
