# 응원·감사 포인트 시스템

## 개요

챌린지 그룹 내에서 목표 시간 전에 인증을 완료한 멤버가 아직 완료하지 못한 팀원에게 **자동으로 응원(auto-cheer)을 발송**하고, 해당 팀원이 완료하면 응원을 보낸 사람에게 **감사 점수**를 돌려주는 시스템입니다.

---

## 포인트 종류

| 포인트 | 이름 | 획득 조건 | 표시 |
|---|---|---|---|
| `score` | 퀘스트 점수 | 당일 퀘스트 완료 1회당 +1 | - |
| `cheerScore` | 응원 점수 | 목표 전 인증 시 응원 발송 대상 수만큼 즉시 적립 | 🎟 |
| `thankScore` | 감사 점수 | 내가 보낸 응원을 받은 팀원이 완료할 때 +1, 전원 완료 보너스 | ✨ |

모든 포인트는 챌린지 가입 시 `0`으로 초기화됩니다.

---

## 핵심 조건: isEarlyCompletion

응원·포인트 시스템이 동작하는 진입 조건입니다.

```
isEarlyCompletion = !isExtra AND dayNowComplete AND delta > 0
```

| 조건 | 설명 |
|---|---|
| `!isExtra` | 보충 인증(리메디) 제출이 아님 |
| `dayNowComplete` | 당일 필요한 모든 퀘스트를 완료함 |
| `delta > 0` | 목표 시각보다 일찍 완료함 |

```
delta(분) = (목표 시각 - 실제 인증 시각) / 60,000ms
```

멤버마다 개인 목표 시간(`personalTarget.time24`)을 가질 수 있고, 없으면 챌린지 공통 목표 시간을 사용합니다.

---

## 전체 플로우

### 1단계 — 인증 완료 (verification/submit)

`isEarlyCompletion = true`이면:

- 그룹의 active 멤버 중 **당일 미완료 멤버** 목록을 조회 (`incompleteMembers`)
- 자신과 비활성 멤버는 제외

#### 분기 A: 미완료 멤버 있음 (`incompleteMembers.length > 0`)

```
미완료 멤버 각각에게 auto-cheer 생성
cheerScore += incompleteMembers.length  (creator면 × 10)
```

응원 발송 시각 계산:

```
scheduledMs = 수신자 목표 시각 − 발신자 delta
isImmediate = scheduledMs ≤ 현재 시각
```

- `isImmediate = true` → `status='sent'`, 푸시 알림 즉시 발송
- `isImmediate = false` → `status='pending'`, `scheduledTime` 예약

**cheerScore는 발송 시점에 즉시 지급됩니다.** 먼저 인증할수록 더 많은 대상에게 응원을 보낼 수 있으므로 더 많은 cheerScore를 얻습니다.

#### 분기 B: 전원 완료 (`incompleteMembers.length === 0`)

마지막으로 완료한 멤버가 트리거. 전원완료 보너스 발동:

```
completedCount = 당일 완료 멤버 수 (자신 포함)

마지막 완료자  → thankScore += completedCount
마지막 완료자  → cheerScore += completedCount  (creator면 × 10)
그 외 active 멤버 → cheerScore += completedCount  (creator면 × 10)
```

### 2단계 — 예약 응원 발송 (send-scheduled cron)

EventBridge로 **5분 주기** 실행. `status='pending'` 이고 `scheduledTime`이 현재~5분 이내인 응원을 처리합니다.

```
수신자 완료 여부 확인
  ├── 이미 완료 → grantThankScoreToSender: 발신자 thankScore +1
  │              응원 status → 'receiver_completed'
  └── 미완료   → 푸시 알림 발송, status → 'sent'
```

### 3단계 — 수신자 인증 완료 시 감사 점수 처리 (verification/submit)

수신자가 인증 완료하면 (`dayNowComplete = true`):

- `status='sent'` AND `isThankScoreGranted ≠ true`인 수신 응원을 조회
- 발견된 응원 각각에 대해:
  - 응원 `status → 'receiver_completed'`, `isThankScoreGranted = true`
  - 발신자 `thankScore += 1`

---

## 중복 처리 방지

cron(send-scheduled)과 verification/submit이 같은 응원을 동시에 처리할 수 있는 경쟁 조건을 다음과 같이 방지합니다:

| 처리 주체 | 조건 | 방지 방법 |
|---|---|---|
| cron | `status='pending'` 인 응원만 처리 | `ConditionExpression: status = :pending` |
| verification/submit | `status='sent'` 인 응원만 처리 | FilterExpression으로 'sent'만 조회 |
| 양쪽 | `isThankScoreGranted = true` 이면 skip | FilterExpression으로 `false`만 조회 |

---

## 시나리오: 2인 그룹, 서로 다른 목표 시간

```
A  목표 07:00 → 06:30 인증 (delta=30분)
B  목표 08:00 → 07:30 인증 (delta=30분)
```

| 시각 | 이벤트 | 처리 |
|---|---|---|
| **06:30** | A 인증 | A→B 응원 생성 `status='pending'` `scheduledTime=07:30` / A `cheerScore +1` |
| **07:30±** | EventBridge cron | A→B 응원 발견 → B 미완료 → 알림 발송 `status='sent'` |
| **07:30** | B 인증 | A→B 응원 발견 → A `thankScore +1` / `incompleteMembers=[]` → 전원완료 보너스 |

**최종 점수 (일반 케이스)**

| 항목 | A | B |
|---|---|---|
| `score` | +1 | +1 |
| `cheerScore` | +1(즉시) + +2(보너스) = **+3** | +2(보너스) |
| `thankScore` | **+1** | **+2** |

**creator 배수 적용 시 (2인 기준, completedCount=2)**

| creator | cheerScore 변화 |
|---|---|
| A가 creator | A: +10(즉시) + +20(보너스) = **+30** / B: +2(보너스) |
| B가 creator | A: +1(즉시) + +2(보너스) = **+3** / B: +0(즉시) + +20(보너스) = **+20** |

---

## 응원 상태 전이

```
[생성]          status = 'pending'
                scheduledTime = '07:30'
    ↓
[케이스 α]      status = 'sent'          ← cron: 수신자 미완료 시 알림 발송
    ↓
[완료]          status = 'receiver_completed'
                isThankScoreGranted = true   ← verification/submit: 수신자 완료 시

[케이스 β]      pending → receiver_completed  ← cron: 수신자 이미 완료 시 직행
[즉시 발송]     status = 'sent'              ← createAutoCheer: isImmediate=true 시 생성 즉시
```

---

## 엣지 케이스

| 상황 | 결과 |
|---|---|
| 목표 시간 이후 인증 (`delta ≤ 0`) | auto-cheer 생성 없음, 포인트 없음 |
| 수신자가 당일 미완료 | 발신자 thankScore 미적립, 응원 `status='sent'` 유지 |
| cron이 수신자 인증보다 먼저 실행 | cron이 알림 발송 → 인증 시 receivedCheers에서 발견 → thankScore +1 |
| cron이 수신자 인증보다 나중에 실행 | 인증 시 `status='pending'`이라 skip → cron이 완료 확인 후 thankScore +1 |
| 보충 인증(isExtra=true) | 포인트 시스템 전체 skip |
| 1인 그룹 | incompleteMembers=[] → 전원완료 보너스만 (auto-cheer 없음) |

---

## 데이터 구조

### CHEERS_TABLE 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `cheerId` | String (PK) | 고유 ID |
| `senderId` | String | 응원 발신자 userId |
| `receiverId` | String | 응원 수신자 userId |
| `challengeId` | String | 챌린지 ID |
| `verificationId` | String | 발신자의 인증 ID |
| `cheerType` | `'immediate' \| 'scheduled'` | 즉시/예약 발송 |
| `status` | `'pending' \| 'sent' \| 'receiver_completed'` | 응원 상태 |
| `scheduledTime` | ISO String \| null | 예약 발송 시각 |
| `sentAt` | ISO String \| null | 실제 발송 시각 |
| `senderDelta` | Number | 발신자의 delta (분) |
| `senderAlias` | String | 익명 별칭 |
| `day` | Number | 챌린지 day |
| `isThankScoreGranted` | Boolean | 감사 점수 지급 여부 |
| `thankScoreGrantedAt` | ISO String \| null | 지급 시각 |

### USER_CHALLENGES_TABLE 포인트 필드

| 필드 | 초기값 | 설명 |
|---|---|---|
| `score` | 0 | 퀘스트 완료 누적 점수 |
| `cheerScore` | 0 | 응원 포인트 |
| `thankScore` | 0 | 감사 포인트 |
| `cheerCount` | 0 | 발송한 응원 수 |

---

## API

### GET /challenges/my

각 챌린지 항목에 포함되는 포인트 필드:

```json
{
  "score": 7,
  "cheerScore": 12,
  "thankScore": 5,
  "cheerCount": 3
}
```

### POST /verification/submit

응답의 `cheerOpportunity` 필드:

```json
// 미완료 멤버 있음 (응원 발송됨)
{
  "hasIncompletePeople": true,
  "incompleteCount": 2,
  "cheerTicketGranted": true
}

// 전원 완료 (보너스 발동)
{
  "hasIncompletePeople": false,
  "incompleteCount": 0,
  "cheerTicketGranted": false,
  "allGroupComplete": true,
  "completedCount": 3
}
```

---

## 프론트엔드 표시 (TodayPage)

활성 챌린지 전체의 `cheerScore`와 `thankScore`를 합산하여 표시합니다.

```
┌─────────────────────────────────────────┐
│ 🎟  응원 점수                      12점 │
│     목표 시간 전에 인증하고              │
│     응원을 보낼 때 쌓여요               │
├─────────────────────────────────────────┤
│ ✨  감사 점수                       5점 │
│     내가 보낸 응원을 받은 팀원가         │
│     완료할 때 쌓여요                    │
└─────────────────────────────────────────┘
```

두 점수 모두 0이면 섹션 미표시.

---

## 관련 코드 위치

| 기능 | 파일 |
|---|---|
| auto-cheer 생성 (`createAutoCheer`) | `backend/services/verification/submit/index.ts` ~line 150 |
| isEarlyCompletion / 분기 처리 | 동 파일 ~line 599, 825 |
| cheerScore 즉시 지급 | 동 파일 ~line 897 |
| 전원완료 보너스 | 동 파일 ~line 832 |
| 수신자 완료 → thankScore | 동 파일 ~line 933 |
| 예약 응원 발송 cron | `backend/services/cheer/send-scheduled/index.ts` |
| my-challenges API | `backend/services/challenge/my-challenges/index.ts` |
| 챌린지 가입 초기화 | `backend/services/challenge/join/index.ts` |
| 포인트 UI | `frontend/src/features/today/pages/TodayPage.tsx` |
