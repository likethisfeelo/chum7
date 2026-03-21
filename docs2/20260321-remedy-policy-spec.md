# 보완인증(Remedy) 정책 기획서 (확정)

## 정책 3종

챌린지 생성 시 리더가 선택. 퀘스트별·참가자별 개별 설정 없음.

| 타입 | 상수 | 규칙 |
|------|------|------|
| **규칙 1** | `anytime` | 언제든 지난 빈날 채우기 가능. Day 3에서 Day 1·2 동시 보완 가능. 횟수 제한 없음 |
| **규칙 2** | `last_day` | 마지막 날(`durationDays`)에만 가능. 리더가 설정한 횟수(`maxRemedyDays`)만큼만 허용. 기본 전체 실패일 |
| **규칙 3** | `disabled` | 보완 불가 |

---

## 날짜 모델 (확정)

| 정책 | 정규 인증 days | 보완 가능 day |
|------|--------------|-------------|
| `anytime` | Day 1 ~ durationDays | Day 2 이후 언제든 (originalDay < currentDay) |
| `last_day` | Day 1 ~ durationDays-1 | Day durationDays (마지막 날) |
| `disabled` | Day 1 ~ durationDays | 없음 |

**예시: 7일 챌린지**
- `anytime`: Days 1-7 정규 인증 + 언제든 빈날 채우기
- `last_day`: Days 1-6 정규 인증 + Day 7에만 보완 (최대 6일까지 설정 가능)
- `disabled`: Days 1-7 정규 인증, 보완 없음

---

## 데이터 모델

### `CHALLENGES_TABLE.defaultRemedyPolicy`
```typescript
{
  type: 'anytime' | 'last_day' | 'disabled'
  maxRemedyDays: number | null   // last_day 전용 (1 ~ durationDays-1), null = 전체 실패일
}
```

### `USER_CHALLENGES_TABLE.progress` 배열 길이
- `last_day` 정책: `durationDays - 1` 개 슬롯 (정규 인증 days만)
- `anytime` / `disabled`: `durationDays` 개 슬롯

### 제거된 필드
- `CHALLENGES_TABLE.defaultRemedyPolicy.allowBulk` → 삭제
- `USER_CHALLENGES_TABLE.remedyPolicy` → 삭제 (join 시 복사 불필요)
- `QUESTS_TABLE.remedyPolicy` → 삭제 (퀘스트별 개별 정책 없음)

---

## 보완 제출 요건

챌린지의 `allowedVerificationTypes`와 **동일** 적용.

| 인증 방식 | 필수 필드 |
|---------|---------|
| `image` | `imageUrl` |
| `video` | `videoUrl` 또는 `imageUrl` |
| `link` | `linkUrl` (https만 허용) |
| `text` | `todayNote` 권장 (soft) |

**공통 선택 필드**: `reflectionNote` (보완 회고, optional), `tomorrowPromise`, `todayNote`

---

## 보완 점수

```
보완 점수 = floor(원래 day 점수 × 0.7)
최소 1점 보장
```

---

## 변경된 파일 목록

| 파일 | 변경 내용 |
|------|---------|
| `backend/services/admin/challenge/create/index.ts` | policy type 3종 변경, `allowBulk` 제거, `maxRemedyDays` 동적 검증 |
| `backend/services/quest/create/index.ts` | `remedyPolicySchema` 및 `remedyPolicy` 필드 완전 제거 |
| `backend/services/challenge/join/index.ts` | `remedyPolicy` 복사 제거, `progress` 배열 길이 동적화 |
| `backend/services/verification/remedy/index.ts` | Day 하드코딩 제거, CHALLENGES_TABLE 조회 추가, 인증방식 검증 추가 |

---

## 에러 코드

| 코드 | 상황 |
|------|------|
| `REMEDY_NOT_ALLOWED` | `disabled` 정책 챌린지 |
| `REMEDY_WRONG_DAY` | `last_day` 정책인데 마지막 날이 아님 / `anytime`인데 Day 1 |
| `REMEDY_TARGET_INVALID` | originalDay가 regularDays 초과, 또는 아직 안 지난 날 |
| `REMEDY_NO_FAILED_DAYS` | 보완할 실패일 없음 |
| `REMEDY_TARGET_ALREADY_DONE` | 이미 보완한 day |
| `REMEDY_MAX_REACHED` | `last_day` 정책에서 maxRemedyDays 도달 |
| `UNSUPPORTED_VERIFICATION_TYPE` | 챌린지 미허용 인증 방식 |
