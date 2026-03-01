# CHME 챌린지 피드 / 챌린지보드 구현 작업계획서 (Phase 기반)

- 문서 버전: 0.2.0
- 작성일: 2026-03-01
- 작성자: Dark 요청사항 반영 업데이트
- 목적: 노션 스타일 챌린지보드 구현 + 공개정책/유료화정책/데이터계측까지 포함한 실행계획 확정

---

## 0) 핵심 방향 (이번 업데이트 반영)

1. **공개 범위 정책 고정**
   - 챌린지보드 본문/댓글은 **참여 승인된 참여자만 열람 가능**
   - 비참여자에게는 본 보드 비공개 (미리보기로 대체)
2. **미리보기 섹션 신설**
   - 챌린지 생성 후 리더가 추가할 수 있는 별도 섹션: `Challenge Preview`
   - 비참여자는 이 미리보기 섹션만 조회 가능
3. **링크 인앱(WebView) 전환은 추후 개발 분리**
   - 본 문서에서는 외부 브라우저 오픈 기준 유지
   - 추후 개발 상세는 별도 MD 문서로 분리
4. **KPI 기본 계측 심기**
   - 확장 가능한 이벤트 스키마로 최소 이벤트 먼저 탑재
5. **유료화 운영 정책 반영**
   - 유료 챌린지: 결제 → 참여 신청 → 승인 실패 시 자동 결제 취소
   - 챌린지 시작 시점 이후 환불 불가
   - 리더 수익 분배는 챌린지 종료 후 확정 정산
   - 리더 롤 수행 미흡/중대 불만 시 리더 정산 제외(고객 환불 없이 별도 보상 정책)

---

## 1) 네이밍/도메인 정리 (혼재 방지)

기존 코드에 `QuestBoardPage`가 이미 “퀘스트 제출 보드” 의미로 사용되고 있어 신규 “노션 스타일 보드”와 충돌 가능성이 높음.

### 권장 용어 체계

- **챌린지 피드 (Challenge Feed)**
  - 참여자가 챌린지에 들어왔을 때 보는 전체 영역
- **챌린지보드 (Challenge Board)**
  - 챌린지 피드 상단 리더 큐레이션 영역 (유료화 차별화 핵심)
- **챌린지 미리보기 (Challenge Preview)**
  - 비참여자 대상 공개 요약 섹션 (신설)
- **퀘스트 제출보드 (Quest Tasks / Quest Submissions)**
  - 기존 `QuestBoardPage` 기능

### 권장 리팩터링

1. `QuestBoardPage` → `QuestTasksPage`
2. 신규 기능 경로
   - `features/challenge-feed/challenge-board/*`
   - `features/challenge-feed/challenge-preview/*`
3. API path
   - `/challenge-board/*`, `/challenge-preview/*`

---

## 2) 아키텍처 개요

```text
[비참여자]
  -> Challenge Preview 조회 가능
  -> Challenge Board / 댓글 조회 불가

[참여자(승인완료)]
  -> Challenge Feed 전체 접근
  -> Challenge Board 열람 + 댓글 작성

[리더]
  -> Challenge Board 편집
  -> 댓글 인용(quote) + 보드 큐레이션
  -> Challenge Preview 작성/수정
```

---

## Phase 1. 정책/스키마 잠금

### 목표
- 공개 정책, 권한, 유료화 상태전이를 개발 가능한 수준으로 확정

### 작업
1. **접근정책 확정**
   - board/comments: participantOnly
   - preview: publicReadable
2. **상태전이 정의 (유료 챌린지)**
   - `payment_completed -> join_requested -> join_approved | join_rejected(refund)`
   - `challenge_started` 이후 일반 환불 불가
3. **리더 정산 정책 정의**
   - 정산 시점: challenge completed 이후
   - 정산 보류/제외 플래그: `leaderPayoutStatus = eligible|withheld`
   - withhold 사유 저장: `payoutWithholdReason`
4. **블록 스키마 v1 확정**
   - `text | image | link | quote`
   - quote는 원댓글 스냅샷 저장
5. **KPI 이벤트 스키마 v1 확정**
   - 이벤트명 + actor + challengeId + timestamp + metadata(json)

### 산출물
- `docs/challenge-feed-domain-glossary.md`
- `docs/challenge-board-api-contract-v1.md`
- `docs/challenge-monetization-policy-v1.md`

---

## Phase 2. 인프라/CDK

### 목표
- 보드/댓글/미리보기/결제상태 참조가 가능한 인프라 배포

### 작업
1. 테이블
   - `challenge-boards`
   - `challenge-comments`
   - `challenge-previews` (신설)
2. 라우트
   - Board: `GET/POST /challenge-board/:challengeId`
   - Comments: `GET/POST /challenge-board/:challengeId/comments`
   - Quote: `POST /challenge-board/:challengeId/comments/:commentId/quote`
   - Preview: `GET/POST /challenge-preview/:challengeId`
3. Authorizer/IAM
   - board/comments는 참여자 여부 체크 필수
   - preview GET은 public, POST는 leader only
4. 관측성
   - KPI 이벤트 적재 경로(SQS/Firehose/이벤트버스 중 택1) 초기 연결

---

## Phase 3. 백엔드 구현

### 목표
- 권한 정책 및 유료 정책을 API 레벨에서 강제

### 구현 범위
1. `get-board`
   - 참여 승인 상태 확인 실패 시 403
2. `upsert-board`
   - leader only
3. `submit-comment`
   - participant only
4. `get-comments`
   - participant only
5. `quote-comment`
   - leader only
6. `get-preview` (신규)
   - public read
7. `upsert-preview` (신규)
   - leader only

### 유료화 연동 처리
- join reject 시 결제 취소 트리거 호출 (또는 결제 서비스 이벤트 발행)
- challenge start 이후 refund API 차단
- challenge completed 시 정산 배치 대상으로 enqueue
- 정산 전 리더 수행검토 결과로 `eligible|withheld` 결정

### 데이터 모델 추가 필드 (권장)
- 참여/결제 도메인
  - `paymentStatus`, `joinStatus`, `refundStatus`, `refundLockedAt`
- 정산 도메인
  - `leaderPayoutStatus`, `leaderPayoutAmount`, `payoutWithholdReason`, `payoutDeterminedAt`

---

## Phase 4. 프론트엔드 구현 (노션 스타일)

### 목표
- 챌린지 피드 상단 보드 + 비참여자 미리보기 분리 제공

### 작업
1. `ChallengeFeedSection` (참여자 전용)
   - `ChallengeBoardView`
   - `CommentSection`
2. `ChallengePreviewSection` (공개)
   - 비참여자 랜딩/상세에서 노출
3. 리더 UX
   - 보드 편집기 + 미리보기 편집기
   - 댓글 인용 시 삽입위치 선택
4. 접근 제어 UX
   - 비참여자에게 보드 영역은 잠금 카드 + “참여 승인 후 전체 열람” 안내
5. 이벤트 계측
   - 뷰/클릭/댓글/인용 이벤트 전송

---

## Phase 5. KPI/운영/정산

### 목표
- 최소 KPI 계측으로 다음 분기 실험 확장 기반 확보

### KPI v1 (기본 심기)
1. `challenge_preview_viewed`
2. `challenge_join_requested`
3. `challenge_join_approved`
4. `challenge_join_rejected_refunded`
5. `challenge_board_viewed`
6. `challenge_comment_created`
7. `challenge_comment_quoted`
8. `leader_board_updated`
9. `challenge_refund_blocked_after_start`
10. `leader_payout_withheld`

### 운영 정책
- 고객 환불: 챌린지 시작 이후 불가
- 리더 분배: 종료 후 확정
- 리더 정산 제외 시:
  - 고객 전액환불은 아님
  - 별도 보상안 지급 가능
  - 제외 금액은 회사 수익/운영비로 전환 정책 적용

---

## 질문/확인 필요사항 (최적화 기본안 포함)

1. **보드 공개 범위**
   - 최적화 기본안: board/comments participant-only 고정
   - 확인 질문: 초대코드 소지자(아직 미참여)에게 예외 열람 허용이 필요한가?

2. **미리보기 섹션 콘텐츠 제한**
   - 최적화 기본안: text/image/link만 허용, quote/comment 연동 없음
   - 확인 질문: 미리보기에도 CTA 버튼(가격/신청)을 삽입할지?

3. **결제 취소 타이밍**
   - 최적화 기본안: join reject 이벤트 수신 즉시 자동 취소(실패 시 재시도 큐)
   - 확인 질문: 수동 승인(운영자 확인 후 취소) 플로우가 필요한가?

4. **리더 정산 제외 기준**
   - 최적화 기본안: 운영검토 기반의 수동 판정 + 사유 필수 입력
   - 확인 질문: 최소 정량 지표(예: 공지 업데이트 0회, 신고 n건 이상)를 자동 경고 기준으로 둘지?

5. **KPI 적재 방식**
   - 최적화 기본안: 이벤트버스 기반 비동기 적재(실패 시 본 기능 영향 없음)
   - 확인 질문: 우선 GA/Amplitude 연동이 필요한지, 내부 BI만 먼저 할지?

---

## 개발 일정 제안 (2주 스프린트)

- Day 1~2: Phase1 정책 잠금 + API contract freeze
- Day 3~5: Phase2 인프라 + Phase3 API 기본 경로
- Day 6~8: Phase4 FE 구현(보드/미리보기/권한 UX)
- Day 9: KPI 이벤트 연결 + 정산/환불 규칙 점검
- Day 10: E2E/릴리즈 체크

---

## 별도 추후개발 문서

- 링크 인앱(WebView) 전환 계획: `docs/challenge-board-link-inapp-future-plan.md`

