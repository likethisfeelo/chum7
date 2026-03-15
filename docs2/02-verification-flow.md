# 인증 업로드 흐름

## 전체 흐름

```
사용자 입력 (InlineVerificationForm)
  │
  ├── 실천 시각 선택 (오늘 날짜 + 현재 이전 시각만 허용)
  ├── 퀘스트 구분 선택 (leader / personal, 혼합형만 표시)
  ├── 인증 유형 선택 (image / text / link / video)
  └── 제출 버튼 클릭
         │
         ▼
POST /verifications
  ├── performedAt: 사용자가 선택한 시각 (formData.completedAt)
  ├── questType: 'leader' | 'personal'
  └── day: 캘린더 계산값 (startDate 기준 경과일)
         │
         ▼
백엔드 submit/index.ts
  ├── day 완료 여부 판단 (challengeType 기준)
  ├── isExtra 결정
  ├── progress 배열 업데이트
  ├── 응원권 발급 (uploadAt 기준)
  └── 200 응답
```

---

## 실천 시각 정책

| 항목 | 값 | 비고 |
|------|-----|------|
| `performedAt` | 사용자가 선택한 시각 | 오늘 날짜, 현재 이전만 허용 |
| `uploadAt` | 백엔드 수신 시각 | 미래 시각 입력 시 400 에러 |
| 응원권 발급 기준 | `uploadAt` | performedAt 아님 |

### 핵심 버그 수정 이력

**수정 전 (버그):**
```typescript
// handleSubmit 직전에 completedAt을 현재 시각으로 덮어씀
const nowLocalDateTime = toLocalDateTimeInputValue(new Date());
setFormData((prev) => ({ ...prev, completedAt: nowLocalDateTime }));
verificationMutation.mutate({ ... });
```

**수정 후:**
```typescript
// 사용자가 입력한 formData.completedAt 그대로 사용
verificationMutation.mutate({ performedAtLocal: formData.completedAt });
```

---

## questType 필드

### 정의

- 인증 레코드에 `questType: 'leader' | 'personal'` 태그 저장
- 혼합형(`leader_personal`) 챌린지에서 어떤 퀘스트에 대한 인증인지 구분

### UI 표시 조건

| challengeType | 표시 여부 |
|---------------|-----------|
| `leader_only` | 숨김 (자동 `leader`) |
| `personal_only` | 숨김 (자동 `personal`) |
| `leader_personal` | 표시 (선택 필수) |

### 기본값

- `leader_personal`: 이전에 제출한 적 없으면 `leader` 기본, 리더 완료 후엔 `personal` 기본

---

## Day 계산

### 프론트엔드에서 제출하는 day 값

```typescript
// startDate 기준 캘린더 계산
function getCalendarChallengeDay(userChallenge: any): number {
  const startDate = userChallenge.startDate;
  if (!startDate) return userChallenge.currentDay || 1;
  const today = toLocalDateString(new Date()); // 'YYYY-MM-DD'
  const start = startDate; // 'YYYY-MM-DD'
  const diffDays = dayDiff(start, today);
  return Math.max(1, Math.min(diffDays + 1, durationDays));
}
```

- `currentDay` (백엔드 저장값)는 표시에 사용하지 않음
- `currentDay`는 `day + 1`로 저장되어 있어 UI에 그대로 쓰면 "내일 날짜"를 보여주는 문제 발생

### 백엔드 검증

- 제출된 `day` 값이 `effectiveCurrentDay ± 1` 범위 내인지 검증 (기존 로직 유지)
- `effectiveCurrentDay = max(stored currentDay, 캘린더 계산값)`

---

## 미디어 URL 처리 정책

### 문제 배경

S3 presigned URL과 CloudFront public URL이 혼재되어, 동일 이미지가 두 개의 다른 URL 형태로 저장됨.
잘못된 URL을 다시 S3 서명 시도 → 404 또는 잘못된 URL 반환.

### 정책

| URL 패턴 | 처리 방법 |
|----------|----------|
| CloudFront `*.cloudfront.net/uploads/...` | 그대로 반환 (재서명 불필요) |
| `*.chum7.com/uploads/...` | 그대로 반환 (재서명 불필요) |
| S3 presigned URL (`X-Amz-Signature` 포함) | 그대로 반환 |
| S3 raw key 또는 `s3://` | `extractImageS3Key`로 key 추출 후 재서명 |

### 단일 진입점

모든 이미지 URL 처리는 `backend/shared/lib/media-key.ts`의 두 함수를 사용:

```typescript
// CloudFront/CDN URL인지 판단
isLikelySignedAssetUrl(url: string): boolean

// S3 key 추출
extractImageS3Key(url: string): string | null
```

**적용 파일:**
- `backend/services/verification/list/index.ts` → `toRenderableMediaUrl()`
- `backend/services/plaza/feed/index.ts` → `toSignedImageUrl()`

---

## 응원권 발급

- 인증 제출 성공 시 응원권 1장 발급
- `source: 'submit'` 또는 `source: 'remedy'`
- 만료 시각: 발급 당일 23:59:59 (KST)
- 발급 기준 시각: `uploadAt` (서버 수신 시각)
