# 보완인증(Remedy) 정책 기획서

## 현재 문제점 요약

| 위치 | 하드코딩 내용 | 문제 |
|------|-------------|------|
| `remedy/index.ts:17` | `originalDay: z.number().min(1).max(5)` | 챌린지가 5일이 아니면 범위 오류 |
| `remedy/index.ts:94` | `if (effectiveCurrentDay !== 6)` | 항상 Day 6에만 보완 허용 |
| `challenge/create/index.ts:50` | `maxRemedyDays: z.number().max(2)` | 최대 보완 횟수가 2로 고정 |

---

## 보완인증 정책 개념

### 정책 위치
- 챌린지 생성 시 `defaultRemedyPolicy`로 설정
- 퀘스트별·참가자별 개별 설정 없음 (제거 대상)
- `USER_CHALLENGES_TABLE`의 `remedyPolicy` 필드 → 삭제 or 무시

### 정책 타입 3종

| 타입 | 의미 | maxRemedyDays |
|------|------|--------------|
| `strict` | 보완 불가 | 해당 없음 |
| `limited` | 제한적 보완 허용 | 1 이상, durationDays 이하 |
| `open` | 실패한 모든 날 보완 가능 | 무제한 (null) |

---

## 유저 관점 흐름

### 시나리오 A: 5일 챌린지, limited(max 1)
```
Day 1 성공 / Day 2 실패 / Day 3 성공 / Day 4 실패 / Day 5 성공
→ Day 6 (보완일): Day 2 또는 Day 4 중 1개만 보완 가능
→ Day 2 보완 완료 → remainingRemedyDays = 0
→ Day 4 보완 시도 → 409 REMEDY_MAX_REACHED
```

### 시나리오 B: 7일 챌린지, open
```
Day 1~7 진행, Day 3·5 실패
→ Day 8 (보완일): Day 3, Day 5 모두 보완 가능
→ 순서 상관없이 각 1회씩 제출
```

### 시나리오 C: strict 챌린지
```
→ 보완 시도 시 즉시 400 REMEDY_NOT_ALLOWED
→ 앱에서는 보완 버튼 자체를 비활성화하는 것 권장
```

---

## 챌린지 리더 관점 설정 항목

챌린지 생성 화면에서 설정:

```
보완 정책 선택:
○ 보완 불가 (strict)
● 제한적 허용 (limited) → 최대 보완 횟수: [  1  ] 일
○ 전체 허용 (open)

□ 같은 날 여러 날 한꺼번에 보완 가능 (allowBulk) ← 현재 미구현
```

**maxRemedyDays 허용 범위**: `1 이상, durationDays - 1 이하`
(전체 기간에서 최소 1일은 직접 성공해야 의미 있음)

---

## 코드 변경 계획

### 1. `challenge/create/index.ts`
```typescript
// 현재 (하드코딩)
maxRemedyDays: z.number().int().min(1).max(2).nullable().default(null)

// 변경 (durationDays 참조)
// Zod 단계에서는 max(30)으로 열어두고,
// handler 내부에서 durationDays - 1 초과 여부 검증
maxRemedyDays: z.number().int().min(1).max(30).nullable().default(null)

// 핸들러 내 추가 검증:
if (input.defaultRemedyPolicy.type === 'limited' &&
    input.defaultRemedyPolicy.maxRemedyDays !== null &&
    input.defaultRemedyPolicy.maxRemedyDays > input.durationDays - 1) {
  return response(400, { error: 'INVALID_MAX_REMEDY_DAYS', message: '최대 보완 횟수는 챌린지 기간 - 1을 초과할 수 없습니다' });
}
```

### 2. `verification/remedy/index.ts`

#### A. `originalDay` 범위 동적화
```typescript
// 현재
originalDay: z.number().min(1).max(5)

// 변경: Zod에서는 열어두고 handler에서 durationDays로 검증
originalDay: z.number().min(1).max(30)

// 핸들러 내부 (challengeId로 챌린지 조회 후):
const durationDays = Number(challenge.durationDays || 5);
if (input.originalDay > durationDays) {
  return response(400, { error: 'REMEDY_TARGET_INVALID', message: '유효하지 않은 day입니다' });
}
```

#### B. 보완일(remedyDay) 동적화
```typescript
// 현재
if (effectiveCurrentDay !== 6) { ... }

// 변경
const remedyDay = durationDays + 1;
if (effectiveCurrentDay !== remedyDay) {
  return response(400, {
    error: 'REMEDY_WRONG_DAY',
    message: `Day ${remedyDay}에만 보완 인증이 가능합니다`
  });
}
```

#### C. 정책 조회 경로 단순화
```typescript
// 현재: userChallenge.remedyPolicy || challenge?.defaultRemedyPolicy || defaultPolicy
// 변경: CHALLENGES_TABLE에서 직접 조회 (challenge는 이미 조회 필요)

const challengeResult = await docClient.send(new GetCommand({
  TableName: process.env.CHALLENGES_TABLE!,
  Key: { challengeId: userChallenge.challengeId }
}));
const challenge = challengeResult.Item;
const remedyPolicy = challenge?.defaultRemedyPolicy ?? { type: 'open', maxRemedyDays: null, allowBulk: null };
const durationDays = Number(challenge?.durationDays ?? 5);
```

#### D. failed days 범위도 동적화
```typescript
// 현재
const failedDays = progress.filter((p: any) => p.status !== 'success' && p.day <= 5);

// 변경
const failedDays = progress.filter((p: any) => p.status !== 'success' && p.day <= durationDays);
```

---

## 응답 변경

```typescript
// 현재 remainingRemedyDays 계산 (한 줄 복잡한 삼항)
// 변경: 명시적 계산
let remainingRemedyDays: number;
if (remedyPolicy.type === 'limited' && remedyPolicy.maxRemedyDays !== null) {
  remainingRemedyDays = Math.max(remedyPolicy.maxRemedyDays - (alreadyRemediedCount + 1), 0);
} else {
  // open: 남은 실패일 수 기준
  remainingRemedyDays = Math.max(failedDays.length - (alreadyRemediedCount + 1), 0);
}
```

---

## ❓ 확인 필요 사항 (기획 결정 필요)

1. **보완일은 항상 `durationDays + 1`인가요?**
   - 예: 5일 챌린지 → Day 6에만 보완
   - 예: 7일 챌린지 → Day 8에만 보완
   - 아니면 챌린지 종료 후 N일 이내 자유롭게?

2. **allowBulk 기능 유지 여부?**
   - 현재 DB에 필드는 있지만 코드에서 미구현 상태
   - 삭제할지, 이번에 구현할지?

3. **userChallenge.remedyPolicy (참가자별 override) 완전 제거할지?**
   - 현재 코드에서 `userChallenge.remedyPolicy`를 먼저 읽음
   - 챌린지 정책으로 통일 시 이 필드 완전 무시

4. **보완 제출 요건 변경 여부?**
   - 현재: `reflectionNote` (min 10자, 필수), `imageUrl` (선택), `todayNote` (필수)
   - 단순화 필요하면 요건 조정

5. **보완 완료 시 알림 필요한지?**
   - 유저 본인 확인 메시지 외에 리더에게도 알림?
   - 현재: 알림 없음

---

## 작업 범위 요약

| 파일 | 변경 내용 | 크기 |
|------|---------|------|
| `challenge/create/index.ts` | `maxRemedyDays.max(2)` → `max(30)` + 핸들러 내 검증 | 소 |
| `verification/remedy/index.ts` | Day 하드코딩 3곳 제거, CHALLENGES_TABLE 조회 추가 | 중 |
| `test/cheer-stabilization-guards.test.ts` | 관련 테스트 업데이트 | 소 |
