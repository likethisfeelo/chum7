# 타임존 표시 지원 기획

## 개요

현재 서비스는 전체가 KST(Asia/Seoul) 기준으로 하드코딩되어 있음.
**백엔드의 Day 경계(자정 기준)는 KST로 유지**하되,
프론트엔드에서 날짜·시간 텍스트 표시만 유저의 실제 브라우저 타임존 기준으로 보여주도록 수정하는 기획.

---

## 현재 상태: 이미 구현된 것

| 항목 | 상태 | 파일 |
|---|---|---|
| `x-user-timezone` 헤더 자동 전송 | ✅ 이미 됨 | `frontend/src/lib/api-client.ts:35` |
| 브라우저 타임존 감지 | ✅ 이미 됨 | `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| 백엔드 `safeTimezone()` / `certDateFromIso()` | ✅ 타임존 파라미터 지원 | `backend/shared/lib/challenge-quest-policy.ts` |
| `datetime-local` 입력 필드 (실천한 시간) | ✅ 브라우저 로컬 시간으로 자동 표시 | `InlineVerificationForm.tsx` |
| `date-fns format()` 피드 타임스탬프 | ✅ 기본적으로 로컬 시간 사용 | 각 피드 카드 컴포넌트 |

---

## 문제: KST 하드코딩 위치

### 1. `ChallengeFeedPage.tsx` (lines 63–106)

```ts
// 수동 UTC+9 오프셋 - KST 고정
const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
```

영향 함수: `isSameKstDate()`, `getKstDateOnly()`, `computeTodayChallengeDay()`
영향 UI: "오늘" 프로그레스 dot 표시, "KST 기준" 텍스트

### 2. `InlineVerificationForm.tsx` (lines 26–66)

```ts
// KST(UTC+9) 기준 오늘 날짜를 UTC midnight Date로 반환
const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
```

영향 함수: `getKstDateOnly()`, `parseChallengeStartDate()`, `getChallengeDay()`
영향 UI: 챌린지 시작일 파싱, 오늘 Day 번호 계산

### 3. `MEPage.tsx` (lines 54–103)

```ts
toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })  // 6곳 하드코딩
```

영향 함수: `isSameKstDate()`, `getTodayInSeoul()`
영향 UI: "오늘 인증 완료" 판단, ME 페이지 날짜 표시

### 4. `ChallengeFeedPage.tsx:987`

```tsx
<span>KST 기준</span>  // 하드코딩 텍스트
```

---

## 수정 방향

### Step 1: 공통 유틸 파일 생성

**신규 파일**: `frontend/src/lib/timezone-utils.ts`

```ts
const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

// 특정 타임존 기준으로 두 날짜가 같은 날인지 비교
export function isSameDateInTz(iso: string | null | undefined, tz = userTz): boolean {
  if (!iso) return false;
  const today = new Date().toLocaleDateString('sv', { timeZone: tz });
  const target = new Date(iso).toLocaleDateString('sv', { timeZone: tz });
  return today === target;
}

// 특정 타임존 기준 "오늘" Date 반환
export function getTodayInTz(tz = userTz): Date {
  const str = new Date().toLocaleDateString('sv', { timeZone: tz }); // "YYYY-MM-DD"
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ISO or date-only 문자열을 특정 타임존 기준 "YYYY-MM-DD"로 변환
export function parseDateInTz(iso: string, tz = userTz): string {
  if (iso.includes('T') || iso.includes('Z')) {
    return new Date(iso).toLocaleDateString('sv', { timeZone: tz });
  }
  return iso.slice(0, 10);
}

// 타임존 약어 반환 ("Asia/Seoul" → "KST", "America/New_York" → "EST" 등)
export function getTzAbbr(tz = userTz): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(new Date());
  return parts.find(p => p.type === 'timeZoneName')?.value ?? tz;
}
```

### Step 2: `ChallengeFeedPage.tsx` 수정

| 기존 | 변경 |
|---|---|
| `isSameKstDate(iso)` | `isSameDateInTz(iso)` |
| `getKstDateOnly()` | `getTodayInTz()` |
| `+9 * 60 * 60 * 1000` 오프셋 | `parseDateInTz()` 사용 |
| `"KST 기준"` 텍스트 | `{getTzAbbr()} 기준` |

### Step 3: `InlineVerificationForm.tsx` 수정

| 기존 | 변경 |
|---|---|
| `getKstDateOnly()` | `getTodayInTz()` |
| `parseChallengeStartDate()` 내 KST 변환 | `parseDateInTz()` 사용 |
| `getChallengeDay()` 내 `getKstDateOnly()` | `getTodayInTz()` |

### Step 4: `MEPage.tsx` 수정

| 기존 | 변경 |
|---|---|
| `isSameKstDate()` | `isSameDateInTz()` |
| `getTodayInSeoul()` | `getTodayInTz()` |
| `toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })` × 6 | `toLocaleDateString('sv', { timeZone: userTz })` |

---

## 백엔드 변경 없음

- Day 경계(자정 기준)는 KST 유지 → 백엔드 수정 불필요
- `x-user-timezone` 헤더는 이미 모든 요청에 전송 중
- `startDate` (YYYY-MM-DD)는 KST 기준으로 이미 올바르게 저장됨

---

## 수정 대상 파일 요약

| 파일 | 변경 내용 | 난이도 |
|---|---|---|
| `frontend/src/lib/timezone-utils.ts` (신규) | 공통 타임존 유틸 함수 4개 | 낮음 |
| `frontend/src/features/challenge-feed/pages/ChallengeFeedPage.tsx` | KST 함수 교체 + "KST 기준" 동적화 | 낮음 |
| `frontend/src/features/verification/components/InlineVerificationForm.tsx` | KST 함수 교체 | 낮음 |
| `frontend/src/features/me/pages/MEPage.tsx` | KST 함수 교체 (6곳) | 낮음 |

---

## 검증 시나리오

1. **KST 유저 (기존과 동일)**: 브라우저 타임존 Asia/Seoul → 모든 동작 기존과 동일
2. **UTC-5 (뉴욕) 유저**:
   - Day 번호는 KST 기준 유지 (백엔드 변경 없음)
   - 피드 타임스탬프, 실천 시간 등은 EST 기준으로 표시
   - 챌린지 피드 하단 "EST 기준" 텍스트 표시
3. **실천한 시간 입력 필드**: `datetime-local` 타입 → 이미 로컬 시간 (변경 없음)
4. **오늘 인증 완료 판단**: 로컬 타임존 자정 기준으로 변경

---

## 주의사항

- **Day 번호 불일치 가능성**: 예를 들어 뉴욕 유저는 KST 자정(오후 10시 EST) 이후 Day가 넘어가는 것을 경험. 이는 의도된 동작 (백엔드 KST 유지).
- 향후 "완전한 타임존 지원"으로 확장 시, 백엔드 `userChallenge.timezone`을 유저 타임존으로 저장하고 Day 경계도 각 유저 기준으로 변경 필요.
