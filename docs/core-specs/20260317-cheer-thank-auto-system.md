# 자동 응원-감사 시스템 기획개발서

**작성일**: 2026-03-17
**작성자**: Claude
**관련 브랜치**: `claude/refactor-core-services-AnYA0`

---

## 1. 배경 및 목적

### 기존 문제

기존 응원·감사 시스템은 수동 상호작용 방식이었다.

- 일찍 인증 시 **티켓**(`USER_CHEER_TICKETS_TABLE`)이 지급됨
- 사용자가 직접 `/cheer/use-ticket` API를 호출해야 응원이 전송됨
- 감사(`thank`)는 `/cheers/{cheerId}/thank` API를 수동으로 호출해야 처리됨
- 인프라(EventBridge 5분 cron + `scheduled-index` GSI)는 구축되어 있었으나 실제로 예약 응원이 생성된 적 없어 활용되지 않음

### 의도한 설계

> "인증을 목표 시간보다 먼저 할 경우 자동 생성되는 방식으로,
> 티켓처럼 주고받지 않고 점수로 상호 누적되는 방식"

1. 목표시간보다 일찍 인증 → 같은 챌린지 그룹의 미완료 멤버 각각에게 **자동 예약 응원** 발송
2. 응원 받은 멤버가 목표시간 전에 인증 → **자동 감사** 처리 + 발신자에게 SNS 알림

---

## 2. 기능 설계

### 2.1 자동 예약 응원 (Auto-Scheduled Cheer)

#### 트리거 조건
- 인증자가 `isEarlyCompletion = true` (목표시간 전 인증, 비추가 인증)
- `userChallenge.groupId`가 존재하는 그룹 챌린지

#### 흐름

```
인증자 A가 목표시간 07:00보다 30분 일찍 06:30에 인증
→ delta = 30분 계산
→ 같은 그룹의 미완료 멤버 B, C 조회
→ B의 목표시간 07:30 → scheduledTime = 07:30 - 30분 = 07:00
→ C의 목표시간 09:00 → scheduledTime = 09:00 - 30분 = 08:30
→ B, C 각각 CHEERS_TABLE에 cheer 생성
   - status: 'pending', cheerType: 'scheduled', scheduledTime: 계산값
→ EventBridge 5분 cron이 scheduledTime 도달 시 push 알림 발송
   - status: 'sent'으로 업데이트
```

#### scheduledTime 계산

```
scheduledTime = 멤버의 목표시간 - sender의 delta(분)
```

- `scheduledTime ≤ 현재시각` → 즉시 발송 (`status: 'sent'`, SNS push 즉시 전송)
- `scheduledTime > 현재시각` → 예약 대기 (`status: 'pending'`)

#### 예외 처리
- 멤버에게 목표시간(`personalTarget.time24`)이 없으면 챌린지 기본 `targetTime` 사용
- 그래도 목표시간이 없으면 응원 생성 skip
- 비그룹 챌린지(`groupId` 없음)는 전체 블록 skip

### 2.2 자동 감사 (Auto-Thank)

#### 트리거 조건
- 인증자가 `isEarlyCompletion = true`
- `CHEERS_TABLE`에 `receiverId = 나`, `challengeId = 현재 챌린지`, `status = 'sent'`, `isThanked = false`인 응원이 존재

#### 흐름

```
멤버 B가 목표시간 07:30보다 10분 일찍 07:20에 인증 (isEarlyCompletion = true)
→ CHEERS_TABLE에서 B가 받은 응원 중 미감사(isThanked=false, status=sent) 조회
→ A가 보낸 cheer 발견
→ isThanked = true, thankedAt = 현재시각으로 업데이트
→ A에게 SNS 알림: "당신의 응원이 힘이 됐어요! ❤️"
```

---

## 3. 데이터 모델

### CHEERS_TABLE 레코드 (자동 생성)

| 필드 | 타입 | 설명 |
|------|------|------|
| `cheerId` | String (UUID) | PK |
| `senderId` | String | 응원 발신자 userId |
| `receiverId` | String | 응원 수신자 userId |
| `verificationId` | String | 발신자의 인증 ID |
| `challengeId` | String | 챌린지 ID |
| `cheerType` | `'immediate'` \| `'scheduled'` | 즉시/예약 |
| `message` | null | 자동 생성이므로 null |
| `senderDelta` | Number | 발신자가 몇 분 일찍 인증했는지 |
| `senderAlias` | String | 익명 별칭 (예: 새벽고래) |
| `scheduledTime` | String \| null | 예약 발송 시각 (ISO 8601), 즉시면 null |
| `status` | `'pending'` \| `'sent'` \| `'failed'` | 상태 |
| `isRead` | Boolean | 수신자가 읽었는지 |
| `isThanked` | Boolean | 감사 처리 여부 |
| `thankedAt` | String \| null | 감사 처리 시각 |
| `createdAt` | String | 생성 시각 |
| `sentAt` | String \| null | 실제 발송 시각 |

### 사용 GSI

| GSI 이름 | 파티션키 | 정렬키 | 사용 위치 |
|----------|---------|--------|---------|
| `scheduled-index` | `status` | `scheduledTime` | send-scheduled Lambda (5분 cron) |
| `receiverId-index` | `receiverId` | - | auto-thank 쿼리 |

---

## 4. 구현 상세

### 수정 파일

#### `backend/services/verification/submit/index.ts`

**추가된 함수:**

```typescript
// 그룹 미완료 멤버에게 자동 예약 응원 생성
async function createAutoCheer(params: {
  senderId, receiverId, challengeId, verificationId,
  delta, senderAlias, memberTarget24, verificationDate,
  memberTimezone, nowISO
}): Promise<void>

// 받은 응원 자동 감사 처리
async function autoThankReceivedCheers(
  userId: string,
  challengeId: string,
  nowISO: string,
): Promise<void>
```

**변경된 블록 (early_completion):**

기존: `checkIncompleteUsers()` → 조건부 티켓 생성
변경: `groupId-index` 쿼리로 미완료 멤버 목록 조회 → 각 멤버에게 `createAutoCheer()` 호출

**추가된 호출:**

```typescript
// 배지 부여 직전, 자동 감사 실행 (non-fatal)
if (isEarlyCompletion) {
  await autoThankReceivedCheers(userId, challengeId, nowISO);
}
```

#### `infra/stacks/verification-stack.ts`

- `VerificationStackProps`에 `cheersTable: Table`, `snsTopic: sns.Topic` 추가
- `commonEnv`에 `CHEERS_TABLE`, `SNS_TOPIC_ARN` 추가
- `submitFn`에 `cheersTable.grantReadWriteData()`, `snsTopic.grantPublish()` 권한 추가

#### `infra/bin/chme.ts`

- `VerificationStack` 생성 시 `coreStack.cheersTable`, `coreStack.snsTopic` 전달 추가

---

## 5. 기존 인프라 활용

### EventBridge 5분 cron → send-scheduled Lambda

변경 없이 그대로 활용. `CHEERS_TABLE`의 `status=pending` 레코드를 5분마다 조회해 발송.

```
[EventBridge 5분 Rule]
  → send-scheduled Lambda
    → CHEERS_TABLE 'scheduled-index' 쿼리
      (status=pending AND scheduledTime BETWEEN now AND now+5min)
    → SNS push 발송
    → status: 'sent'으로 업데이트
```

### 익명 별칭 (senderAlias)

발신자 실명 대신 랜덤 동물 별칭 사용:
`새벽고래`, `숲토끼`, `별다람쥐`, `파도해달`, `노을팬더`, `하늘사슴`

---

## 6. 기존 티켓 시스템과의 관계

| 항목 | 기존 | 변경 후 |
|------|------|---------|
| early_completion | 티켓 생성 (수동 사용) | 자동 예약 응원 생성 |
| streak_3 | 티켓 생성 | 그대로 유지 |
| complete | 티켓 3개 생성 | 그대로 유지 |
| 감사 | 수동 API 호출 | 자동 처리 (early 인증 시) |

`streak_3`, `complete` 티켓은 변경하지 않음.
향후 해당 티켓의 활용 방식도 검토 필요.

---

## 7. 검증 시나리오

| # | 시나리오 | 기대 결과 |
|---|---------|---------|
| 1 | A가 그룹 챌린지에서 목표보다 30분 일찍 인증 | 미완료 멤버 각각에게 `scheduledTime = 목표-30분`으로 pending cheer 생성 |
| 2 | scheduledTime이 현재시각보다 과거 | `status='sent'`로 즉시 생성 + SNS push |
| 3 | EventBridge cron 실행 | pending cheer 중 시간 도달한 것 → sent + SNS push |
| 4 | B가 목표 전 조기 인증 | B가 받은 A의 cheer `isThanked=true` + A에게 SNS 알림 |
| 5 | 목표시간 없는 멤버 | 응원 생성 skip |
| 6 | 비그룹 챌린지 | 자동 응원 블록 전체 skip |
| 7 | 동시성 충돌 (이미 감사됨) | `ConditionalCheckFailedException` → 조용히 skip |

---

## 8. 향후 고려사항

- [ ] `streak_3` / `complete` 티켓도 자동화된 방식으로 전환 검토
- [ ] 하루 1회 이상 응원 중복 방지 로직 필요 여부 검토 (현재는 미완료 멤버 수만큼 생성)
- [ ] 다음날 케이스: 오늘 미완료 멤버가 없을 때 다음날 리더 목표시간 기준으로 응원 예약 기능 (미구현)
- [ ] `senderAlias` 대신 실제 사용자 아이콘/닉네임 연동 시 users 테이블 조회 필요
- [ ] 응원 발송 성공/실패 지표 추가 (CloudWatch 메트릭)
