# CHME 챌린지 피드 / 챌린지보드 구현 작업계획서 (Phase 기반)

- 문서 버전: 0.2.1
- 작성일: 2026-03-04
- 작성자: Dark 피드백 반영 정리본
- 목적: 확정된 3화면 구조(프리뷰 보드 / 챌린지 피드 / 챌린지 보드) 기준으로 BE/FE/인프라 실행계획 잠금

---

## 변경 요약 (v0.2.0 → v0.2.1)

| 항목 | v0.2.0 | v0.2.1 |
|------|--------|--------|
| 익명 ID | 미확정 | 일 단위 고정 익명 ID 생성 규칙 확정 |
| 리더 DM | 미확정 | 1차 권장안(기존 알림/메시지 도메인 재사용) 제시 |
| 프리뷰 보드 DB | 미확정 | 별도 테이블 확정 + 챌린지 메타 자동 프리필 정책 추가 |
| ME탭 리팩터링 | 범위 협의 | 이번 스프린트 포함으로 확정 |

---

## 0) 네이밍/도메인 확정

### 용어 사전

| 용어 | 정의 |
|------|------|
| **프리뷰 보드 (Preview Board)** | 비참여자 포함 누구나 조회 가능한 소개/참여 독려 콘텐츠 |
| **챌린지 피드 (Challenge Feed)** | 참여 확정자만 진입 가능한 메인 허브(인증/현황/응원/레메디/보드 진입) |
| **챌린지 보드 (Challenge Board)** | 챌린지 피드 하위 리더 큐레이션 보드(댓글/인용) |
| **퀘스트 작업/제출 (Quest Tasks)** | 기존 `QuestBoardPage` 기능(변경 없음) |

### 네이밍 리팩터링

- `QuestBoardPage` → `QuestTasksPage` (또는 `QuestSubmissionPage`)
- FE 경로
  - `features/preview-board/`
  - `features/challenge-feed/`
  - `features/challenge-feed/challenge-board/`
- API path
  - `/preview-board/:challengeId`
  - `/challenge-feed/:challengeId`
  - `/challenge-board/:challengeId`

---

## 1) 사용자 플로우 확정

```text
앱 접속
  -> 챌린지 탐색(탭1)
    -> 챌린지 상세 + 프리뷰 보드 조회
      -> 참여 신청
        -> 챌린지 피드 진입(참여 확정자)
          -> 인증 게시물 피드(익명)
          -> 오늘 인증/현황
          -> 응원권 / 레메디
          -> 챌린지 보드 진입
          -> 리더 DM

ME탭
  -> 참여 중/완료 챌린지 목록
    -> 선택한 챌린지 피드로 바로 이동
```

---

## 2) 핵심 결정사항 (Dark 피드백 반영)

### 2-1. 익명 ID 생성 규칙 (확정)

- 목적: 피드 내 익명성 유지 + 하루 동안 식별 가능성 확보
- 표시 포맷: `동물명 + 3자리 숫자` (예: `고래-274`)
- 생성 규칙(서버):
  1. `seed = sha256(challengeId + userId + yyyy-mm-dd + ANON_SALT)`
  2. `animalIndex = seed[0..3] % 동물사전길이`
  3. `number = (seed[4..7] % 900) + 100`
- 성질:
  - 같은 유저라도 **챌린지별/날짜별**로 다른 ID
  - 같은 날짜에는 동일 챌린지 내 고정
  - 원본 userId 역추적 불가(서버 SALT 필요)

### 2-2. 리더 DM 1차 권장안 (확정 제안)

- **권장안 A (이번 스프린트 적용)**: 기존 알림/메시지 도메인 재사용 + 1:1 DM 스레드 생성
  - 버튼 클릭 시 `leaderDmThreadId`가 있으면 스레드 진입
  - 없으면 `challengeId + participantId + leaderId` 기반으로 스레드 upsert
- 장점:
  - 신규 도메인/인프라 최소화
  - 권한/차단/신고 체계 재사용 가능
  - 릴리즈 리스크 낮음
- 추후 확장:
  - 전용 챌린지 DM 도메인 분리(읽지않음 배지, SLA, 운영도구 강화)

### 2-3. 프리뷰 보드 DB 전략 (확정)

- 별도 테이블 유지: `chme-dev-preview-boards`
- 이유:
  - 공개/편집 권한이 챌린지 보드와 다름
  - 비참여자 고트래픽 조회 분리 가능
  - 보드 기능 확장 시 스키마 충돌 최소화
- 단, 작성 편의성을 위해 **초기 프리필(끌어오기) 정책** 추가:
  - 챌린지 생성/첫 프리뷰 진입 시 아래 항목 자동 블록 생성
    - 챌린지 유형
    - 일정(시작/종료)
    - 참여 방식 요약
  - 데이터 소스: 챌린지 마스터 테이블(읽기 전용 스냅샷)
  - 리더가 이후 수정하면 프리뷰 보드 내용 우선(마스터 자동동기화 없음)

### 2-4. ME탭 리팩터링 범위 (확정)

- 이번 스프린트 포함
- 범위:
  - 참여 중/완료 챌린지 목록 컴포넌트
  - 각 아이템에서 챌린지 피드 딥링크
  - 주요 상태 요약(오늘 인증 여부, 미확인 알림 카운트)
- 비범위:
  - ME탭 전면 IA 재설계
  - 어스탭 통합 리디자인

---

## Phase 1. 도메인/스키마 잠금

### 목표
- 3화면 구조와 확정 의사결정을 개발 가능한 상태로 고정

### 작업
1. 블록 스키마 고정
   - 프리뷰: `text | image | link`
   - 챌린지 보드: `text | image | link | quote`
   - 공통 필드: `id, type, order`
2. 권한 정책 고정
   - 생성자 편집: `creatorId === requesterId`
   - 참여자 전용 접근: 챌린지 피드/보드/댓글
3. Quote/댓글 정책 고정
   - 스냅샷 저장: `authorName`, `content`
   - 1댓글 1인용, 댓글 수정/삭제 미구현
4. 익명 ID 규격/동물사전/해시 알고리즘 문서화
5. ME탭 리팩터링 요구사항 동결

### 산출물
- `docs/challenge-feed-domain-glossary.md`
- `docs/challenge-board-api-contract-v1.md`
- `docs/challenge-feed-anonymous-id-spec.md` (신규)

---

## Phase 2. 인프라 구축 (CDK + DynamoDB)

### 목표
- 프리뷰/보드/댓글 + DM 연동에 필요한 인프라 연결

### 작업
1. DynamoDB 테이블
   - `chme-dev-preview-boards` (별도)
   - `chme-dev-challenge-boards`
   - `chme-dev-challenge-comments`
2. API Gateway 라우트
   - `GET/POST /preview-board/:challengeId`
   - `GET/POST /challenge-board/:challengeId`
   - `GET/POST /challenge-board/:challengeId/comments`
   - `POST /challenge-board/:challengeId/comments/:commentId/quote`
3. 프리뷰 초기 프리필 Lambda 트리거
   - 챌린지 메타 기반 기본 블록 생성
4. CDK 스택
   - `infra/stacks/preview-board-stack.ts`
   - `infra/stacks/challenge-board-stack.ts`

### 완료 기준
- dev 배포 성공
- 프리뷰 첫 진입 시 기본 블록 자동생성 확인

---

## Phase 3. 백엔드 구현 (Lambda)

### 목표
- 프리뷰 2개 + 챌린지보드 5개 + 익명 ID/DM 연동 처리

### 작업
1. 프리뷰 보드 서비스
   - `get-preview-board`
   - `upsert-preview-board` (생성자 전용)
   - 미존재 시 챌린지 메타로 프리필 생성
2. 챌린지 보드 서비스
   - `get-board`, `upsert-board`, `submit-comment`, `get-comments`, `quote-comment`
3. 익명 ID 처리
   - 피드 응답 DTO에서 작성자명 대신 `dailyAnonymousId` 반환
4. DM 연결 API
   - `POST /challenge-feed/:challengeId/leader-dm` (thread upsert 후 threadId 반환)
5. 공통 처리
   - 에러 형식 `{ error, message, code }`
   - 접근 차단 403 일관 처리

### 완료 기준
- API contract 정상/권한/예외 검증
- 익명 ID 일 단위 변경 E2E 확인

---

## Phase 4. 프론트엔드 구현

### 목표
- 3화면 + ME탭 리팩터링 + DM/익명 표시 반영

### 작업
1. 프리뷰 보드
   - 조회 컴포넌트(비참여자 포함)
   - 생성자 편집기
   - 초기 프리필 블록 UI 노출
2. 챌린지 피드
   - 인증 피드(익명 ID 표시)
   - 참여자/오늘 현황, 응원권/레메디
   - 챌린지 보드 진입 버튼
   - 리더 DM 버튼(스레드 생성/진입)
3. 챌린지 보드
   - 조회/편집/블록 렌더링
   - 댓글 작성/목록/인용
4. ME탭 리팩터링
   - 참여 중/완료 챌린지 리스트
   - 챌린지 피드 바로가기
   - 요약 카드(오늘 인증, 알림)

### 완료 기준
- 참여자/비참여자/생성자/리더 시나리오별 정상 동작
- ME탭에서 챌린지 피드 전환 플로우 검증

---

## Phase 5. 통합 QA / 릴리즈 준비

### 목표
- 구조 변경 회귀 없이 릴리즈 가능한 수준까지 통합 검증

### 테스트 시나리오
1. 비참여자 프리뷰 보드 조회 가능
2. 비참여자 챌린지 피드/보드 접근 차단(403)
3. 참여자 챌린지 피드 진입 및 보드 조회 가능
4. 피드 작성자 익명 ID가 일 단위로 변경되는지 확인
5. 생성자 프리뷰 편집 반영 + 프리필 유지 동작 확인
6. 생성자 챌린지 보드 편집 + 댓글 인용 가능
7. 참여자의 보드 편집/인용 차단(403)
8. 리더 DM 버튼 클릭 시 스레드 생성/재진입 정상
9. ME탭에서 챌린지 피드 숏컷 전환 정상
10. 기존 QuestTasksPage 회귀 없음

### 운영 체크
- CloudWatch 알람: 5xx, 지연, 권한 실패율
- 익명 ID 충돌률 모니터링(일일)
- 롤백 절차 문서화

---

## 스프린트 일정 제안 (2주)

- Day 1~2: Phase 1 잠금(익명ID/DM/프리필/ME 포함)
- Day 3~5: Phase 2 인프라 + Phase 3 BE 기본 구현
- Day 6~9: Phase 4 FE 구현 + ME탭 리팩터링
- Day 10: Phase 5 통합 QA / 버그픽스

---

*문서 버전 0.2.1 — 추가 질문은 Dark에게 문의*
