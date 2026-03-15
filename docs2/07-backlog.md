# 보류 및 향후 작업 목록

## 완료된 작업 (2025-03 기준)

| 항목 | 파일 | 상태 |
|------|------|------|
| 혼합형 day 완료 로직 (leaderQuestDone + personalQuestDone) | `verification/submit/index.ts` | ✅ 완료 |
| questType 필드 신규 추가 | `verification/submit/index.ts`, `InlineVerificationForm.tsx` | ✅ 완료 |
| nextDay 하드코딩 제거 (durationDays 기반) | `verification/submit/index.ts` | ✅ 완료 |
| 미디어 URL 처리 단일화 (media-key.ts) | `verification/list`, `plaza/feed`, `media-key.ts` | ✅ 완료 |
| CloudFront /uploads/ URL 재서명 방지 | `backend/shared/lib/media-key.ts` | ✅ 완료 |
| Remedy effectiveCurrentDay (캘린더 기반) | `verification/remedy/index.ts` | ✅ 완료 |
| completedAt 덮어쓰기 버그 수정 | `InlineVerificationForm.tsx` | ✅ 완료 |
| ME탭 Day 표시 캘린더 기준으로 통일 | `MEPage.tsx` | ✅ 완료 |
| MyRecordsPage 페이지네이션 버그 | `MyRecordsPage.tsx` | ✅ 완료 |
| resolveChallengeBucket 동의어 통일 | `challengeLifecycle.ts` | ✅ 완료 |
| 챌린지 피드 퀘스트 보드 challengeType별 표시 | `ChallengeFeedPage.tsx` | ✅ 완료 |
| AdminChallengeCreatePage mixed 제거 + personalQuestEnabled 자동화 | `AdminChallengeCreatePage.tsx` | ✅ 완료 |
| admin/challenge/create personalQuestEnabled 자동 결정 | `admin/challenge/create/index.ts` | ✅ 완료 |

---

## 향후 작업 (백로그)

### 1. 챌린지 보드 댓글 공개 기능

**현황:** `challenge-board` 서비스에 댓글 공개/비공개 로직 부분 구현됨.

**스펙:**
- 댓글 기본: 비공개 (리더 + 작성자만 조회)
- 리더가 개별 댓글을 공개로 전환 가능 (대댓글 포함 여부 선택)
- 공개된 댓글의 대댓글: 리더만 작성, 일반 참여자는 조회만

**남은 작업:**
- 리더 전용 댓글 공개 전환 UI
- 대댓글 공개 범위 제어 로직
- 프론트엔드 챌린지 보드 댓글 렌더링

---

### 2. Plaza 피드 성능 최적화

**현황:** 현재 전체 테이블 스캔(Scan) 방식으로 피드를 조회 중.

**문제:** 데이터 증가 시 비용 및 지연 시간 급증.

**방향:**
- GSI(Global Secondary Index) 추가 (`isPublic-createdAt-index` 등)
- 커서 기반 페이지네이션 최적화

---

### 3. 챌린지 보드 원노트/미로보드 스타일

**현황:** 현재 간단한 블록 리스트 형태.

**방향:**
- 드래그 앤 드롭 블록 재정렬
- 이미지 + 텍스트 혼합 블록
- 섹션 구분선, 헤더 블록 추가

---

### 4. 유료 챌린지 결제 플로우

**현황:** `joinApprovalRequired`, 결제 구조 코드만 유지.

**방향:**
- 결제 게이트웨이 연동 (PG사 선정 후)
- 결제 완료 → 참여 자동 확정 또는 어드민 승인 플로우
- 환불 정책 구현

---

### 5. 보완 인증 (Remedy) 확장

**현황:** Day 6 전용, 단일 제출만 가능.

**보류 이유:** 현재 스펙(Day 6 전용)으로 충분함. 향후 사용자 피드백에 따라 검토.

**잠재적 확장:**
- Day 6 이외에도 보완 가능한 시점 추가 (e.g., `allowBulk: true` 시 마지막 날)
- 보완 인증 결과를 별도 피드로 표시

---

### 6. 퀘스트 페이지 (`/quests`) challengeType 조건부 렌더링

**현황:** 퀘스트 페이지 자체는 챌린지피드 외부 라우트.

**남은 작업:**
- `leader_only`: 개인퀘스트 섹션 숨김
- `personal_only`: 리더퀘스트 섹션 숨김, "개인퀘스트로 진행되는 챌린지" 안내
- `leader_personal`: 리더퀘스트 + 개인퀘스트 모두 표시

---

### 7. admin/challenge/update 챌린지 유형 변경 지원

**현황:** `backend/services/admin/challenge/update/index.ts`는 제목/설명/카테고리 등 기본 필드만 업데이트 지원. `challengeType` 변경 불가.

**방향:**
- 챌린지 시작 전(`draft`, `recruiting` 상태)에 한해 `challengeType` 변경 허용
- 변경 시 `personalQuestEnabled` 자동 재결정
