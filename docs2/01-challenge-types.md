# 챌린지 유형 정의 및 인증 완료 기준

## 개요

챌린지는 `challengeType` 필드 하나로 모든 인증 완료 로직이 결정된다.
어드민이 챌린지 생성 시 유형을 선택하면, 이후 인증 업로드·진행도 업데이트·피드 표시까지 이 값을 기준으로 동작한다.

---

## 유형 정의

| 값 | 이름 | 하루 인증 완료 조건 | 개인퀘스트 |
|----|------|---------------------|-----------|
| `leader_only` | 리더 퀘스트형 | 리더퀘스트 인증 1개 | 없음 |
| `personal_only` | 개인 퀘스트형 | 개인퀘스트 인증 1개 | 필수 |
| `leader_personal` | 리더+개인 혼합형 | 리더퀘스트 **AND** 개인퀘스트 인증 모두 | 필수 |

> `mixed`는 `leader_personal`과 동일한 의미. DB에 `mixed`로 저장된 데이터도 코드에서 `leader_personal`과 동일하게 처리한다.

---

## 인증 완료 판단 로직

### progress 배열 구조 (유형별)

```typescript
// leader_only
{ day: 3, leaderQuestDone: true, status: 'success', ... }

// personal_only
{ day: 3, personalQuestDone: true, status: 'success', ... }

// leader_personal (혼합형)
// - 첫 번째 인증 후 (미완료 상태)
{ day: 3, leaderQuestDone: true, personalQuestDone: false, status: 'partial', ... }

// - 두 번째 인증 후 (완료)
{ day: 3, leaderQuestDone: true, personalQuestDone: true, status: 'success', ... }
```

### isDayComplete 판단

```typescript
function isDayComplete(dp: any, challengeType: string): boolean {
  const isMixed = challengeType === 'leader_personal' || challengeType === 'mixed';
  if (isMixed) return dp.leaderQuestDone === true && dp.personalQuestDone === true;
  if (challengeType === 'leader_only') return dp.leaderQuestDone === true;
  if (challengeType === 'personal_only') return dp.personalQuestDone === true;
  return dp.status === 'success'; // fallback
}
```

---

## isExtra 판단 기준

인증 업로드 시 해당 인증이 "추가 기록(extra)"인지 판단:

| 조건 | isExtra |
|------|---------|
| 당일이 이미 완료(isDayComplete === true) | `true` |
| 혼합형이고 같은 questType을 이미 제출한 경우 | `true` |
| 그 외 (퀘스트 미완료 상태에서 새 퀘스트 인증) | `false` |

---

## personalQuestEnabled 자동 결정

`personalQuestEnabled`는 `challengeType`에서 자동으로 결정된다.
어드민이 별도로 설정할 수 없으며, 백엔드에서 강제한다.

| challengeType | personalQuestEnabled |
|---------------|----------------------|
| `leader_only` | `false` |
| `personal_only` | `true` |
| `leader_personal` / `mixed` | `true` |

**구현 위치:** `backend/services/admin/challenge/create/index.ts` → `resolvePersonalQuestEnabled()`

---

## 챌린지 유형별 UI 제한

### 인증 업로드 폼 (InlineVerificationForm)

- `leader_only`: 퀘스트 구분 선택 숨김 (항상 `leader` 자동 적용)
- `personal_only`: 퀘스트 구분 선택 숨김 (항상 `personal` 자동 적용)
- `leader_personal`: 리더 퀘스트 / 개인 퀘스트 선택 UI 표시

### 챌린지 피드 퀘스트 보드 버튼 레이블

- `leader_only` → "리더 퀘스트 📋"
- `personal_only` → "개인 퀘스트 📋" + "개인퀘스트로 진행되는 챌린지입니다" 안내
- `leader_personal` → "퀘스트 보드 📋" + "리더퀘스트 + 개인퀘스트 모두 인증해야 하루 완료" 안내

---

## 혼합형 중간 응답 처리

`leader_personal` 챌린지에서 첫 번째 인증(quests 1개) 제출 시:
- `isDayComplete: false`를 포함한 200 응답 반환
- progress 상태: `status: 'partial'`, 해당 questType done 플래그 `true`
- 두 번째 인증 제출 완료 시 `status: 'success'`로 업데이트

---

## 보완 인증 (Remedy)

- **Day 6에만 가능** (현재 구현 유지)
- Day 1~5 중 실패한 날에 대해 보완 인증 제출
- 보완 완료 시 해당 progress 항목 `status: 'success'`, `remedied: true`로 업데이트
- `effectiveCurrentDay` = `max(stored currentDay, 캘린더 계산 day)` 기준으로 Day 6 여부 판단
