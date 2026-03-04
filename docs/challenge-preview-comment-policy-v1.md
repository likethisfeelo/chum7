# Challenge Preview 댓글/소통 정책 v1

- 작성일: 2026-03-04
- 목적: 프리뷰 보드 댓글 소통 규칙 확정 및 구현 기준 정의

---

## 1) 기본 원칙

1. 프리뷰 댓글 작성자는 익명 ID로 표시한다.
2. 프리뷰 댓글은 기본적으로 **1:1(작성자 ↔ 생성자)** 상태다.
3. 생성자가 승인하면 해당 댓글 스레드를 전체 공개로 전환할 수 있다.
4. 공개된 스레드의 대댓글 작성 권한은 생성자에게만 있다.
5. 공개 승인 전에는 생성자 외 누구도 다른 사람 댓글을 볼 수 없다.

---

## 2) 노출 규칙

### 비참여자/참여자 공통
- 프리뷰 본문은 공개 조회 가능
- 댓글은 내 댓글 스레드만 조회 가능(기본)

### 생성자
- 모든 1:1 댓글 스레드 조회 가능
- 댓글별 공개 승인/회수 가능
- 공개 댓글 스레드에 대댓글 작성 가능

---

## 3) 데이터 모델(초안)

### preview-comments
- `commentId` (PK)
- `challengeId` (GSI)
- `authorUserId`
- `authorAnonymousId`
- `content`
- `visibility` = `private_1to1 | approved_public`
- `approvedBy` / `approvedAt`
- `createdAt`

### preview-comment-replies
- `replyId` (PK)
- `commentId` (GSI)
- `challengeId`
- `authorUserId` (v1: creator만 허용)
- `content`
- `createdAt`

---

## 4) 권한 규칙(초안)

- `POST /preview-board/:challengeId/comments`
  - 인증 사용자 누구나 가능
- `GET /preview-board/:challengeId/comments`
  - 일반 사용자: 본인 작성 + 공개 승인된 댓글만
  - 생성자: 전체 댓글
- `POST /preview-board/:challengeId/comments/:commentId/approve`
  - 생성자만 가능
- `POST /preview-board/:challengeId/comments/:commentId/replies`
  - 생성자만 가능

---

## 5) 챌린지 보드 연동

- 생성자는 프리뷰 댓글 내용을 챌린지 보드로 그대로 인용/이관 가능
- 이관 시 텍스트 기본 + 이미지/링크 블록 지원
- 링크 클릭 시 정책
  - 외부 앱/새 창/인앱 브라우저 중 선택 UI 제공

---

## 6) 현재 반영 상태

- 본 문서는 정책/설계 기준 문서이며, API/DB/화면은 후속 구현 필요
- 우선순위: admin 편집 기능 완료 후 preview 댓글 도메인 구현
