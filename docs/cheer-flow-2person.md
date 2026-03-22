# 목표시간·인증·응원 플로우 — 2인 그룹 시나리오

---

## 개요

챌린지 그룹 내에서 각 멤버가 **각자의 목표 시간 전에** 인증을 완료할 때 자동으로 응원(auto-cheer)이 생성·발송되고 점수가 처리되는 전체 흐름을 설명합니다.

---

## 핵심 개념

### 목표 시간 (Target Time)

각 멤버는 개인 목표 시간(`personalTarget.time24`)을 설정할 수 있으며, 없으면 챌린지 공통 목표 시간(`challenge.targetTime`)이 사용됩니다.

```
effectiveTargetTime = personalTarget.time24 ?? challenge.targetTime
```

### delta (조기 완료 분)

```
delta (분) = (목표 시각 - 실제 인증 시각) / 60,000ms
```

- `delta > 0` → 목표 시간 전에 완료 (`isEarlyCompletion = true`)
- `delta ≤ 0` → 목표 시간 이후 완료

### 예약 응원 발송 시각 계산

```
scheduledMs = 수신자 목표 시각(ms) − 발신자 delta(ms)
isImmediate = scheduledMs ≤ 지금 시각
```

수신자가 자신의 목표 시간이 됐을 때, 발신자가 목표 전 얼마나 먼저 했는지 만큼 앞서서 응원이 도착하도록 설계됩니다.

---

## 시나리오 설정

```
참여자  목표시간  실제 인증   delta
──────────────────────────────────
A       07:00    06:30     30분
B       08:00    07:30     30분

A가 먼저 인증
```

---

## 전체 타임라인

### ① 06:30 — A 인증 완료 (`verification/submit`)

```
delta          = (07:00 − 06:30) = 30분
dayNowComplete = true
isEarlyCompletion = true   (!isExtra && dayNowComplete && delta > 0)
```

**A가 받은 응원 감사 점수 처리**
- B→A 응원: 아직 없음 → 처리 없음

**미완료 멤버 확인**
```
incompleteMembers = [B]   (B는 아직 미완료)
→ 전원 완료 보너스 조건 불충족
```

**auto-cheer 생성 (A → B)**
```
B의 목표시각    = 08:00
scheduledMs    = 08:00 − 30분 = 07:30
isImmediate    = 07:30 ≤ 06:30? → false
→ cheerType = 'scheduled'
   status    = 'pending'
   scheduledTime = '07:30'
```

DB에 저장, 알림 미발송.

---

### ② 07:30 (± 5분) — EventBridge cron 실행 (`send-scheduled`)

5분 주기로 실행. `07:30 ~ 07:35` 범위의 `status='pending'` 응원 조회 → **A→B 응원 발견**.

**B 완료 여부 확인 분기**

| 분기 | B 상태 | 처리 |
|---|---|---|
| **케이스 α** | 아직 미완료 | 푸시 알림 발송 → `status='sent'`, `sentAt=07:30` |
| **케이스 β** | 이미 완료 (타이밍 경쟁) | 알림 없음 → `grantThankScoreToSender(A)` → A `thankScore +1`, 응원 `status='receiver_completed'`, `isThankScoreGranted=true` |

---

### ③ 07:30 — B 인증 완료 (`verification/submit`)

```
delta          = (08:00 − 07:30) = 30분
dayNowComplete = true
isEarlyCompletion = true
```

**B가 받은 응원 감사 점수 처리** (케이스 α일 때)
```
receivedCheers(B) 조회:
  status='sent' AND isThankScoreGranted ≠ true
→ A→B 응원 발견
→ A thankScore += 1
→ 응원: status='receiver_completed', isThankScoreGranted=true
```
*(케이스 β이면 이미 처리됨 → 조회 결과 없음, 중복 없음)*

**미완료 멤버 확인**
```
incompleteMembers = []   (A는 이미 완료)
→ 전원 완료 보너스 발동!
```

**전원 완료 보너스 계산**
```
allActive      = [A]
completedToday = [A](이미 완료) → 1명
completedCount = 1 + 1(자신 B) = 2
```

| 대상 | 항목 | 변화 |
|---|---|---|
| B (마지막 완료자) | `thankScore` | +2 |
| B | `cheerScore` | +2 &nbsp;(리더면 +20) |
| A | `cheerScore` | +2 &nbsp;(리더면 +20) |

---

## 최종 점수 결과

### 일반 케이스 (둘 다 리더 아님)

| 항목 | A | B | 발생 시점 |
|---|---|---|---|
| `score` (일일 인증) | +1 | +1 | 각자 인증 완료 시 |
| `thankScore` | +1 | +2 | A: B 완료 시 / B: 전원완료 보너스 |
| `cheerScore` | +2 | +2 | B의 인증 완료 시 (전원완료 보너스) |

### A가 리더인 케이스

| 항목 | A | B |
|---|---|---|
| `score` | +1 | +1 |
| `thankScore` | +1 | +2 |
| `cheerScore` | **+20** | +2 |

### B가 리더인 케이스

| 항목 | A | B |
|---|---|---|
| `score` | +1 | +1 |
| `thankScore` | +1 | +2 |
| `cheerScore` | +2 | **+20** |

---

## 응원 상태 전이 (A→B 응원 기준)

```
[생성]     status='pending',  scheduledTime='07:30'      (06:30, A 인증 시)
    ↓
[케이스 α]  status='sent',    sentAt='07:30'             (cron 실행, B 미완료)
    ↓
[완료]     status='receiver_completed',
           isThankScoreGranted=true,
           thankScoreGrantedAt='07:30'                  (B 인증 완료 시)

[케이스 β]  (cron 실행 시 B 이미 완료)
    pending → receiver_completed  직행                  (cron send-scheduled에서)
```

---

## 엣지 케이스

| 상황 | 동작 |
|---|---|
| B가 목표 시간 **이후** 완료 (08:10, `isEarlyCompletion=false`) | 전원완료 보너스 없음. cron이 07:30에 B에게 알림 발송(status='sent') → B 완료 시 A `thankScore +1`만 기록 |
| B가 **당일 미완료** | A `thankScore` 미기록. A→B 응원 `status='sent'` 유지. 익일 이월 처리 없음 |
| cron이 B 인증보다 **먼저** 실행 | 응원 `status='sent'` 설정 → B 인증 시 receivedCheers에서 발견 → A `thankScore +1` |
| cron이 B 인증보다 **나중에** 실행 | 응원 `status='pending'` → receivedCheers 쿼리 미발견 → cron이 B 완료 확인 → A `thankScore +1` |
| A가 **목표 시간 이후** 인증 (`isEarlyCompletion=false`) | auto-cheer 생성 없음. 응원·점수 처리 없음 |

---

## 관련 코드 위치

| 기능 | 파일 | 주요 로직 |
|---|---|---|
| delta 계산 | `backend/services/verification/submit/index.ts` ~line 565 | `(targetMs - completedMs) / 60000` |
| isEarlyCompletion | 동 파일 ~line 599 | `!isExtra && dayNowComplete && delta > 0` |
| auto-cheer 생성 | 동 파일 `createAutoCheer()` ~line 150 | scheduledMs, isImmediate 계산 |
| 예약 응원 발송 | `backend/services/cheer/send-scheduled/index.ts` | EventBridge 5분 cron |
| 수신자 완료 → 감사 점수 | `backend/services/verification/submit/index.ts` ~line 867 | receiverId-index 조회 |
| 전원 완료 보너스 | 동 파일 ~line 848 | `incompleteMembers.length === 0` 분기 |
