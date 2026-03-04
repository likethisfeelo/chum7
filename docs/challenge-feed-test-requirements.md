# Challenge Feed / Board 테스트 필요내역 (Phase 5 상세)

- 작성일: 2026-03-04
- 목적: 현재 구현(익명 ID, 프리뷰 프리필, 리더 DM, 피드/보드 화면) 기준 최소 테스트 범위 고정

---

## 1) 범위

### 백엔드
- `submit-comment` 익명 ID 생성/저장
- `get-comments` DTO 표준화(`dailyAnonymousId` 노출)
- `get-preview` 미존재 시 프리필 생성
- `leader-dm` 스레드 upsert(기존/신규)

### 프론트엔드
- `ChallengeFeedPage` 데이터 로드/에러 처리
- `ChallengeBoardPage` 댓글 작성 플로우
- `MEPage` 숏컷(피드/보드/리더DM)
- `ChallengeDetailPage` 프리뷰 보드 렌더링

---

## 2) API 단위 테스트 (필수)

### A. submit-comment
1. 참여자 권한일 때 200 + `dailyAnonymousId` 반환
2. `ANON_ID_SALT` 미설정 시 `500 ANON_SALT_NOT_CONFIGURED`
3. 비참여자일 때 403
4. 1000자 초과 시 400

### B. get-comments
1. 정상 응답에 `comments[].dailyAnonymousId` 포함
2. legacy 데이터(익명 ID 없음)에서 `'익명-000'` fallback
3. nextToken pagination 정상

### C. get-preview
1. preview 존재 시 그대로 반환
2. preview 미존재 시 challenge 메타 기반 blocks 자동 생성
3. 동일 challenge 동시 요청 시 조건부 put 충돌에도 500 없이 처리(재조회 fallback 권장)

### D. leader-dm
1. 첫 요청: `isNew=true`, `threadId` 반환, notification 생성
2. 재요청: `isNew=false`, 동일 `threadId` 반환
3. 비참여자: 403
4. challenge 없음: 404

---

## 3) 프론트 통합 테스트 (권장)

### ChallengeFeedPage
- 로딩/성공/실패 상태 렌더링
- 상단 `챌린지 보드 요약` 블록 렌더링 + 보드 이동 버튼 동작
- 오늘 미인증 상태에서 `오늘 인증 작성하기` 노출 및 VerificationSheet 오픈
- 오늘 인증 완료 상태에서 완료 배너/응원 가능 문구 노출
- 오늘 인증 완료 인원/전체 참여자 요약 카드 수치 렌더링
- `내 응원권/기록 현황` 영역에서 내 인증 누적/응원 상태 문구 렌더링
- 인증 피드 목록 렌더링(텍스트/이미지) 및 empty 상태 노출
- 리더 DM 버튼 클릭 시 API 호출 1회

### ChallengeBoardPage
- 보드 blocks 렌더링(text/image/link/quote)
- 댓글 등록 성공 후 목록 invalidate/refresh

### MEPage
- active/pending/completed 카드에서
  - 피드 열기
  - 보드
  - 리더 DM
  세 액션 모두 노출 및 클릭 가능

### ChallengeDetailPage
- 프리뷰 보드 블록 렌더링
- 빈 프리뷰일 때 empty message 노출

---

## 4) E2E 시나리오 (필수)

1. 참여자가 ME 탭에서 `피드 열기` → 피드 진입
2. 피드에서 `챌린지 보드` → 보드 진입
3. 보드에서 댓글 작성 → 익명 ID 표시 확인
4. 리더 DM 버튼 클릭 → threadId 생성/재진입 확인
5. 비참여자로 피드/보드 접근 시 403 확인
6. 챌린지 상세 진입 시 프리뷰 보드 프리필 자동 생성 확인

---

## 5) 실행 체크리스트

- [ ] backend 단위 테스트 추가 및 CI 포함
- [ ] frontend component/integration 테스트 추가
- [ ] e2e smoke 테스트 스크립트 확보
- [ ] release 전 QA 수기 테스트 1회 완료

### 5-1) 지금 확인할 항목(우선)
- [ ] 챌린지별 인증 피드 필터 정확도(공개 인증 100건 초과 시 페이징 전략)
- [ ] KST 기준 오늘 인증 집계 정확도(UTC 경계 시간 포함)
- [ ] 인증 완료 직후 피드 데이터 invalidate/재조회 반영
- [ ] 미참여자 접근 시 CTA(인증 작성) 비노출 및 오류 문구 처리
- [ ] 리더 DM deepLink가 없을 때 fallback 토스트 + threadId 복사 동작

---

## 6) 권장 명령어 예시

```bash
# Frontend
npm --prefix frontend run build

# Infra type check
npm --prefix infra run build

# (추가 예정) Backend test
npm --prefix backend test

# (추가 예정) E2E
npm --prefix frontend run test:e2e
```
