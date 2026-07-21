# 어드민 챌린지 생성 규칙

## 챌린지 생성 흐름

```
어드민 로그인 (admins 또는 leaders 그룹)
  │
  ▼
POST /admin/challenges
  │
  ├── 챌린지 생성 (lifecycle: 'draft' 또는 'recruiting')
  │
  └── 수동 lifecycle 전환 버튼
      ├── recruiting → preparing → active → completed
      └── PATCH /admin/challenges/{id}/lifecycle
```

---

## 챌린지 유형 (challengeType)

어드민 폼에서 선택 가능한 유형은 3가지:

| 값 | 이름 | 설명 |
|----|------|------|
| `leader_only` | 리더 퀘스트형 | 리더가 설계한 퀘스트 1개 인증으로 하루 완료. 개인퀘스트 없음. |
| `personal_only` | 개인 퀘스트형 | 참여자 개인 퀘스트 1개 인증으로 하루 완료. 리더퀘스트 없음. |
| `leader_personal` | 리더+개인 혼합형 | 리더퀘스트 + 개인퀘스트 모두 인증해야 하루 완료. |

> `mixed`는 UI에서 제거. DB에 `mixed`로 저장된 기존 챌린지는 백엔드에서 `leader_personal`과 동일하게 처리.

---

## personalQuestEnabled 자동 결정

어드민이 직접 설정하지 않으며, 백엔드에서 `challengeType` 기반으로 강제 결정.

| challengeType | personalQuestEnabled |
|---------------|----------------------|
| `leader_only` | `false` |
| `personal_only` | `true` |
| `leader_personal` / `mixed` | `true` |

**구현:** `backend/services/admin/challenge/create/index.ts`
```typescript
function resolvePersonalQuestEnabled(challengeType: string): boolean {
  if (challengeType === 'leader_only') return false;
  return true; // personal_only, leader_personal, mixed
}
```

---

## layerPolicy 자동 결정

`requirePersonalGoalOnJoin`은 `challengeType`에 따라 일부 자동 고정:

| challengeType | requirePersonalGoalOnJoin |
|---------------|--------------------------|
| `leader_only` | `false` (강제) |
| `personal_only` | `true` (강제) |
| `leader_personal` | `true` (강제) |

`requirePersonalTargetOnJoin`, `allowExtraVisibilityToggle`은 어드민이 자유 설정 가능.

---

## 일정 규칙

```
recruitingStartAt < recruitingEndAt < challengeStartAt (최소 1분 이후)
challengeEndAt = challengeStartAt + durationDays (백엔드 자동 계산)
```

- 현재 시각이 `recruitingStartAt` 이후면 생성 시 `lifecycle: 'recruiting'` 자동 적용
- 이전이면 `lifecycle: 'draft'`

---

## Lifecycle 상태 머신

```
draft → recruiting → preparing → active → completed → archived
```

| 상태 | 의미 |
|------|------|
| `draft` | 관리자 초안, 사용자에게 비공개 |
| `recruiting` | 모집 중, 참여 신청 가능 |
| `preparing` | 모집 마감, 챌린지 시작 전 준비 기간 (보드 활성화) |
| `active` | 챌린지 진행 중 (Day 1~N) |
| `completed` | 챌린지 종료, 결과 확정 |
| `archived` | 보관, 조회만 가능 |

---

## 보완(Remedy) 정책 설정

| 유형 | 설명 | maxRemedyDays |
|------|------|----------------|
| `strict` | 보완 불가 | — |
| `limited` | 제한 횟수 보완 가능 | 1 또는 2 |
| `open` | 횟수 제한 없이 보완 가능 | — |

`open` 유형에서 `allowBulk: true`이면 한 번에 여러 날 몰아서 보완 제출 허용.

---

## 참여 승인 설정

- `joinApprovalRequired: true`: 참여 신청 후 어드민 승인 필요 (유료 챌린지용)
- `joinApprovalRequired: false`: 신청 즉시 자동 확정 (무료 챌린지)

> 현재는 무료 챌린지만 운영 중. `joinApprovalRequired: false` 권장.

---

## 인증 유형 허용 설정

챌린지별로 허용할 인증 방식 복수 선택 가능:

| 값 | 설명 |
|----|------|
| `image` | 사진 인증 |
| `text` | 텍스트 인증 |
| `link` | URL 링크 인증 |
| `video` | 영상 인증 |

기본값: 4가지 모두 허용.
