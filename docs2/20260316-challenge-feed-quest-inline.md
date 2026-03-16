# 챌린지 피드 퀘스트 인라인 표시 (2026-03-16)

## 배경 / 문제

챌린지 피드에서 인증을 하려면 "퀘스트 보드 →" 버튼을 눌러 별도 페이지(`/quests?challengeId=...`)로 이동해야 했음.
이동 → 퀘스트 선택 → QuestSubmitSheet 열기의 3단계 흐름이 UX 마찰을 유발.

목표: **챌린지 피드 안에서 퀘스트 카드를 직접 보고, 제출까지 완료**할 수 있도록 개선.

---

## 기획 결정

### 채택 방식: 퀘스트 카드 인라인 표시

- 피드에서 `GET /quests?challengeId=&status=active` 로 퀘스트 목록을 조회
- `active` lifecycle일 때만 "오늘의 퀘스트" 섹션 렌더
- 각 퀘스트 카드에서 "제출하기" 버튼 클릭 시 기존 `QuestSubmitSheet` 바텀시트 직접 오픈
- 네비게이션 없이 피드에서 인증 완료

### 기각된 방식

| 방식 | 기각 이유 |
|---|---|
| InlineVerificationForm 통합 | 두 시스템(`POST /verifications` vs `POST /quests/{id}/submit`) 의 역할이 다름. 일일 진행도 vs 퀘스트 포인트/승인 흐름 분리 유지가 필요 |
| 퀘스트 보드 버튼 + 미완료 배지 | UX 개선이 미미함 |

---

## 구조 설계

### 챌린지 타입별 퀘스트 섹션

| challengeType | 섹션 제목 | 표시 내용 |
|---|---|---|
| `leader_only` | 리더 퀘스트 📋 | 리더 퀘스트 카드 목록 (파란색) |
| `personal_only` | 개인 퀘스트 📋 | 승인된 내 개인 퀘스트 카드 1개 (주황색) |
| `leader_personal` | 오늘의 퀘스트 📋 | 리더 퀘스트 목록 + 개인 퀘스트 카드 |

### 퀘스트 카드 상태 표시

| mySubmission 상태 | 표시 |
|---|---|
| null (미제출) | `[제출하기]` 버튼 |
| `rejected` | `[재제출 ↩️]` 버튼 |
| `pending` | `심사중 🔄` 배지 (버튼 비활성) |
| `approved` / `auto_approved` | `완료 ✅` 배지 |

### 개인 퀘스트 미승인 상태 처리

- 퀘스트 목록에 personal quest 없고 (`questsData`에 없음)
- `myProposalData.latestProposal` 있는 경우:
  - `pending` / `revision_pending` → "⏳ 개인 퀘스트 승인 대기 중입니다."
  - 기타 → "개인 퀘스트가 없습니다. 제안 섹션에서 제출해주세요."

---

## 구현 내용

### 파일: `frontend/src/features/challenge-feed/pages/ChallengeFeedPage.tsx`

#### 1. 쿼리 변경

```typescript
// Before: personal quest만 조회
const { data: personalQuestData } = useQuery({
  queryKey: ["challenge-personal-quests", challengeId],
  queryFn: async () => {
    const quests = res.data?.data?.quests ?? [];
    return quests.find((q) => q.questScope === 'personal') ?? null;  // personal만
  },
});

// After: 모든 퀘스트 조회
const { data: questsData } = useQuery({
  queryKey: ["challenge-quests", challengeId],
  queryFn: async () => res.data?.data?.quests ?? [],
});
```

#### 2. 파생 값 계산

```typescript
const leaderQuests = useMemo(
  () => (questsData || []).filter((q) => q.questScope !== 'personal'),
  [questsData],
);
const personalQuest = useMemo(
  () => (questsData || []).find((q) => q.questScope === 'personal') ?? null,
  [questsData],
);
```

#### 3. 상태 일반화

```typescript
// Before
const [selectedPersonalQuest, setSelectedPersonalQuest] = useState<any>(null);

// After
const [selectedQuest, setSelectedQuest] = useState<any>(null);
```

#### 4. JSX 구조 변경

```
Before:
  [보드 요약] - "퀘스트 보드 →" 이동 버튼
  [개인 퀘스트 제안 섹션] - "개인 퀘스트 인증 제출하기 →" 버튼
  [InlineVerificationForm]
  [QuestSubmitSheet (personalQuest용)]

After:
  [보드 요약] - "보드 전체 보기 →" + "퀘스트 목록 →" (회색 보조 링크로 강등)
  [개인 퀘스트 제안 섹션] - 제안 상태 표시만 (인증 제출 버튼 제거)
  [오늘의 퀘스트 섹션] ← NEW (active lifecycle에서만 표시)
    - 리더 퀘스트 카드들 (파란색)
    - 개인 퀘스트 카드 (주황색)
    - 미승인 안내 메시지
  [InlineVerificationForm] - 일일 인증 (기존 유지)
  [QuestSubmitSheet] - selectedQuest 기반으로 범용 처리
```

#### 5. QuestSubmitSheet onSuccess 추가

```typescript
<QuestSubmitSheet
  isOpen={!!selectedQuest}
  onClose={() => setSelectedQuest(null)}
  quest={selectedQuest}
  onSuccess={() => queryClient.invalidateQueries({ queryKey: ["challenge-quests", challengeId] })}
/>
```
제출 성공 후 퀘스트 목록 revalidate → 카드 상태 자동 갱신.

---

## 동시에 수정된 버그 (동일 세션)

### `backend/services/quest/submit/index.ts` — 500 오류 수정

**원인:** `TransactWriteCommand`에서 `ACTIVE_QUEST_SUBMISSIONS_TABLE`에 대해
`ConditionCheck`과 `Put` 두 개의 작업이 같은 키(`${userId}#${questId}`)를 대상으로 발생.
DynamoDB는 동일 트랜잭션에서 같은 아이템에 여러 작업 불허 → `ValidationException` → 500.

**수정:** `ConditionCheck` 항목 제거, `Put`에 `ConditionExpression: 'attribute_not_exists(activeSubmissionId)'` 통합.

```typescript
// Before (잘못된 패턴)
TransactItems: [
  { ConditionCheck: { TableName: ACTIVE_TABLE, Key: { activeSubmissionId }, ... } },
  { Put: { TableName: QUEST_SUBMISSIONS_TABLE, Item: submission } },
  { Put: { TableName: ACTIVE_TABLE, Item: { activeSubmissionId, ... } } },  // 같은 키!
  { Update: { TableName: QUESTS_TABLE, ... } },
]

// After (올바른 패턴)
TransactItems: [
  { Put: { TableName: QUEST_SUBMISSIONS_TABLE, Item: submission } },
  { Put: { TableName: ACTIVE_TABLE, Item: { activeSubmissionId, ... },
           ConditionExpression: 'attribute_not_exists(activeSubmissionId)' } },
  { Update: { TableName: QUESTS_TABLE, ... } },
]
```

### `backend/services/challenge/personal-quest/submit/index.ts` — 빌드 오류 제거

이전 세션에서 `registrationDeadline` 기반 마감 검사를 제거했으나,
`item` 객체에 `registrationDeadline` 참조가 남아 있던 문제와
사용하지 않는 `deadline` 함수 제거.

---

## 배포 시 확인 항목

- [ ] `leader_only` 챌린지: 리더 퀘스트 카드만 표시되는지
- [ ] `personal_only` 챌린지: 승인된 개인 퀘스트 카드만 표시되는지
- [ ] `leader_personal` 챌린지: 리더 + 개인 두 섹션 모두 표시되는지
- [ ] 퀘스트 제출 후 카드 상태 갱신 (심사중 → 완료)
- [ ] 기각(rejected) 상태에서 "재제출 ↩️" 버튼 동작
- [ ] 개인 퀘스트 미승인 상태에서 안내 메시지 표시
- [ ] `preparing` lifecycle에서 오늘의 퀘스트 섹션 미표시
- [ ] 이미지/영상 업로드 후 퀘스트 제출 500 오류 없는지 (quest-submit fix)
