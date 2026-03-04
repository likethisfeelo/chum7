# CHME Challenge Feed 도메인 용어집 (v1)

- version: 1.0.0
- updatedAt: 2026-03-04
- scope: Preview Board / Challenge Feed / Challenge Board / ME 탭

---

## 1) 핵심 도메인

| 용어 | 영문 | 정의 | 접근권한 |
|---|---|---|---|
| 프리뷰 보드 | Preview Board | 비참여자 포함 누구나 조회 가능한 챌린지 소개/참여 독려 보드 | Public Read / Creator Write |
| 챌린지 피드 | Challenge Feed | 참여 확정자 전용 메인 허브(인증 피드/현황/응원/레메디/보드/DM) | Participant Read |
| 챌린지 보드 | Challenge Board | 챌린지 피드 내부 리더 큐레이션 가이드 보드 | Participant Read / Creator Write |
| 챌린지 댓글 | Challenge Comment | 챌린지 보드 하단 댓글. 참여자 작성 가능 | Participant Read/Write |
| 인용 블록 | Quote Block | 댓글을 보드 본문으로 승격한 블록 | Creator Write |
| 리더 DM | Leader DM | 참여자가 리더에게 1:1 문의하는 메시지 진입점 | Participant/Leader |
| Quest Tasks | Quest Tasks | 기존 QuestBoardPage 기능(제출/진행 상태) | 기존 정책 유지 |

---

## 2) 권한 규칙 (Phase 1)

| 액션 | 권한 |
|---|---|
| 프리뷰 보드 조회 | 누구나 |
| 프리뷰 보드 수정 | 챌린지 생성자 |
| 챌린지 피드 진입 | 참여 확정자 |
| 챌린지 보드 조회 | 참여 확정자 |
| 챌린지 보드 수정 | 챌린지 생성자 |
| 댓글 작성 | 참여 확정자 |
| 댓글 인용 | 챌린지 생성자 |
| 리더 DM 스레드 생성/진입 | 참여 확정자/리더 |

---

## 3) 데이터 엔티티

### PreviewBoard
- PK: `challengeId`
- fields
  - `challengeId: string`
  - `blocks: PreviewBlock[]` (`text | image | link`)
  - `prefillSource: ChallengeMetaSnapshot`
  - `isPublic: boolean`
  - `updatedAt: string`
  - `updatedBy: string`

### ChallengeBoard
- PK: `challengeId`
- fields
  - `challengeId: string`
  - `blocks: ChallengeBlock[]` (`text | image | link | quote`)
  - `editors: string[]` (Phase 1 예약 필드)
  - `isPublic: boolean`
  - `updatedAt: string`
  - `updatedBy: string`

### ChallengeComment
- PK: `commentId`
- GSI: `challengeId-createdAt`
- fields
  - `commentId: string`
  - `challengeId: string`
  - `userId: string`
  - `dailyAnonymousId: string`
  - `authorNameSnapshot?: string` (운영/감사 용도)
  - `content: string`
  - `isQuoted: boolean`
  - `quotedAt?: string`
  - `createdAt: string`

---

## 4) 상태/정책 메모

- 댓글 수정/삭제: Phase 1 미지원.
- Quote 정책: 댓글 원문 snapshot(`authorName/content`)으로 블록 생성.
- 프리뷰 프리필: 챌린지 메타(유형/일정/참여방식) 최초 생성 시 자동 블록 주입.
- 프리필 이후 수정 우선순위: PreviewBoard가 Source of Truth.
- 익명 표시: 피드 UI에는 `dailyAnonymousId`만 노출.

---

## 5) 네이밍 표준

- FE feature 경로
  - `features/preview-board/*`
  - `features/challenge-feed/*`
  - `features/challenge-feed/challenge-board/*`
- API
  - `/preview-board/:challengeId`
  - `/challenge-feed/:challengeId`
  - `/challenge-board/:challengeId`
- 테이블
  - `chme-dev-preview-boards`
  - `chme-dev-challenge-boards`
  - `chme-dev-challenge-comments`
