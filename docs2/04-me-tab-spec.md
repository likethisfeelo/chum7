# 미탭 (ME Tab) UX 규칙

## 탭 구조

```
미탭
├── 진행중 탭 (기본)
└── 완주 탭
```

---

## 진행중 탭 섹션 구조

```
진행중 탭
│
├── [섹션 1] 오늘 미인증 챌린지 (가장 중요)
│   ├── 챌린지 카드 (Day X/Y 표시)
│   └── InlineVerificationForm (인증 폼 바로 노출)
│
├── [섹션 2] 나머지 미인증 챌린지들 (접혀있음 또는 리스트)
│   └── 카드 리스트 (클릭 시 챌린지 피드로 이동)
│
└── [섹션 3] 오늘 인증 완료한 챌린지 (타임라인 형태)
    └── 완료 시각 + 획득 점수 표시
```

---

## Day 표시 규칙

### 표시 형식

```
Day X / Y
```

- `X`: 오늘이 챌린지 몇 번째 날인지 (캘린더 기준)
- `Y`: 챌린지 총 기간 (`durationDays`)

### 계산 방법

```typescript
// 캘린더 기준 계산 (startDate → 오늘까지 경과일 + 1)
function getCalendarChallengeDay(userChallenge: any): number {
  const startDate = userChallenge.startDate; // 'YYYY-MM-DD'
  if (!startDate) return 1;
  const today = getLocalDateString(); // 사용자 타임존 기준 오늘 날짜
  const elapsed = daysBetween(startDate, today);
  const durationDays = userChallenge.challenge?.durationDays || 7;
  return Math.max(1, Math.min(elapsed + 1, durationDays));
}
```

### currentDay를 표시에 쓰면 안 되는 이유

백엔드는 인증 제출 후 `currentDay = day + 1`로 업데이트한다.
즉, Day 3 인증을 완료하면 `currentDay = 4`가 된다.
이를 그대로 표시하면 "Day 4/7"이 보여 사용자가 혼란스럽다.

**결론:** `currentDay`는 백엔드 내부 추적용으로만 사용. UI는 항상 `startDate` 기준 캘린더 계산값 사용.

---

## 챌린지 버킷 분류 (`resolveChallengeBucket`)

미탭에서 챌린지를 어느 탭/섹션에 넣을지 결정하는 로직.

```
ChallengeBucket = 'active' | 'preparing' | 'completed' | 'other'
```

| 버킷 | 조건 | 표시 위치 |
|------|------|-----------|
| `active` | 진행 중 | 진행중 탭 |
| `preparing` | 참여 완료, 챌린지 시작 전 | 진행중 탭 (준비중 배지) |
| `completed` | 완주 또는 실패 | 완주 탭 |
| `other` | 그 외 (초안 등) | 표시 안 함 |

### 동의어 처리

백엔드 API가 반환하는 `status`/`phase` 값이 `'active'`와 `'in_progress'` 두 가지로 혼재할 수 있음.
코드에서 두 값을 동일하게 취급한다.

```typescript
const isUserInActivePhase =
  userPhase === 'in_progress' || userPhase === 'active' ||
  userStatus === 'active' || userStatus === 'in_progress';
```

---

## 내 추가기록 페이지 (MyRecordsPage) 페이지네이션 정책

- 초기 로드: 최신 10건
- 더보기 버튼: 10건씩 추가 로드
- visibility 변경(나만보기 → 공개) 후 데이터 재조회 시: **기존 페이지네이션 상태 유지**
  - 전체 목록을 교체하지 않고, 기존 아이템의 `isPersonalOnly` 값만 업데이트

```typescript
// 재조회 시 페이지네이션 보존
const updatedMap = new Map(myExtraFeedPage.verifications.map((v) => [v.verificationId, v]));
setExtraItems((prev) => prev.map((item) => updatedMap.get(item.verificationId) ?? item));
// extraNextToken은 변경하지 않음
```

---

## 추가기록 (Extra) 공개 전환 정책

- 인증 시 추가기록은 기본 `isPersonalOnly: true` (나만 보기)
- 미탭 > 내 추가기록에서 개별/전체/선택 공개 전환 가능
- 공개 전환 API: `PATCH /verifications/{id}/visibility`
- 공개 전환 후 Plaza(마당) 피드에 노출됨
