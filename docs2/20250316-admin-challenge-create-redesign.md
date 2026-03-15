# AdminChallengeCreatePage 재설계 기획서

> 작성일: 2025-03-16

## 배경

기존 어드민 챌린지 생성 폼의 문제점:
- `challengeType`이 드롭다운으로만 표시되어 각 유형의 의미가 불명확
- `requirePersonalGoalOnJoin`이 독립 체크박스로 존재 → challengeType과 충돌 가능
- 일정 순서 오류를 제출 후에야 알게 됨 (인라인 검증 없음)
- 생성 성공 시 `alert()` 팝업 → lifecycle 전환 UI와 단절됨
- 섹션 구분 없이 길게 나열되어 어드민이 어떤 값을 설정해야 할지 혼란

---

## 변경 사항

### UX

| 항목 | 이전 | 이후 |
|------|------|------|
| 챌린지 유형 | `<select>` 드롭다운 | 아이콘 + 설명 포함 라디오 카드 3개 |
| 인증 방식 | 체크박스 리스트 | 토글 칩 버튼 (✓ 표시) |
| 보완 정책 | radio + 텍스트 | 아이콘 카드 (자유/제한/엄격) |
| 일정 입력 | 2열 그리드 | 순서 화살표(`↓`) 포함 세로 배치 |
| 기간 설정 | 숫자 입력만 | 7/14/21/30일 프리셋 버튼 + 수동 입력 |
| 생성 성공 | `alert()` | 인라인 녹색 패널 (ID, 상태, 전환 버튼) |
| 타임라인 오류 | 상단 에러 메시지 | 각 필드 아래 인라인 에러 |

### 섹션 순서

```
1. 기본 정보 (제목, 설명, 카테고리, 목표시각, 정체성키워드)
2. 챌린지 유형 (라디오 카드)
3. 완주 배지 (아이콘 + 이름)
4. 일정 (모집시작 → 모집마감 → 챌린지시작, 기간)
5. 허용 인증 방식 (토글 칩)
6. 보완 인증 정책 (아이콘 카드)
7. 참여 및 운영 설정 (최대인원, 체크박스들)
```

---

## 로직 안전성

### `requirePersonalGoalOnJoin` 폼 상태 제거

기존에는 독립 체크박스로 노출되어 `challengeType`과 충돌 가능했음.

**변경 후:** 폼 상태에서 제거하고 payload 구성 시 자동 결정:

```typescript
const requirePersonalGoalOnJoin = form.challengeType !== 'leader_only';
// leader_only → false
// personal_only, leader_personal → true
```

백엔드 `resolveLayerPolicy()`도 동일하게 처리 (이미 적용됨).

### 인라인 타임라인 검증

```typescript
const timelineErrors = useMemo(() => {
  const errors: Record<string, string> = {};
  if (recruitingEndAt <= recruitingStartAt)
    errors.recruitingEndAt = '모집 마감일은 모집 시작일 이후여야 합니다';
  if (challengeStartAt < recruitingEndAt + 1분)
    errors.challengeStartAt = '챌린지 시작일은 모집 마감 후 최소 1분 이후여야 합니다';
  return errors;
}, [form.recruitingStartAt, form.recruitingEndAt, form.challengeStartAt]);
```

### 기타 기본값 변경

| 항목 | 이전 기본값 | 변경 기본값 | 이유 |
|------|------------|------------|------|
| `joinApprovalRequired` | `true` | `false` | 현재 무료 챌린지만 운영 |
| `personalQuestAutoApprove` | `true` | `true` (유지) | 편의성 |

### `personalQuestAutoApprove` 조건부 표시

`challengeType === 'leader_only'`일 때 숨김 (개인퀘스트 없으므로 무의미).

---

## payload 구조 (DB 에러 방지)

```typescript
{
  title, description, category, targetTime, identityKeyword,
  badgeIcon, badgeName,
  recruitingStartAt: ISO string,
  recruitingEndAt: ISO string,
  challengeStartAt: ISO string,
  durationDays: number (1~30),
  challengeType: 'leader_only' | 'personal_only' | 'leader_personal',
  defaultRemedyPolicy: {
    type: 'strict' | 'limited' | 'open',
    maxRemedyDays: 1 | 2 | null,  // limited만 숫자, 나머지 null
    allowBulk: boolean | null,     // open만 boolean, 나머지 null
  },
  layerPolicy: {
    requirePersonalGoalOnJoin: challengeType !== 'leader_only',
    requirePersonalTargetOnJoin: boolean,
    allowExtraVisibilityToggle: boolean,
  },
  personalQuestAutoApprove: boolean,
  joinApprovalRequired: boolean,
  allowedVerificationTypes: ['image'|'text'|'link'|'video', ...],
  // maxParticipants: number | 생략 (비워두면 전송 안 함)
}
```

---

## 생성 후 lifecycle 전환 패널

`alert()` 제거. 생성 성공 시 페이지 상단에 인라인 패널 표시:

```
✅ 챌린지 생성 완료!
ID: xxxxxxxx-xxxx-xxxx
현재 상태: 초안 / 모집중

[모집 시작]  [모집 마감]  [챌린지 시작]  [완료 처리]
```

각 버튼 클릭 시 `PUT /admin/challenges/{id}/lifecycle` 호출.
에러 발생 시 패널 내 인라인 에러 표시.

---

## 향후 고려 (이번 범위 외)

- 챌린지 수정 페이지(`AdminChallengeUpdatePage`) 별도 작성
- `admin/challenge/update` API에 `challengeType` 변경 지원 (현재 미지원)
