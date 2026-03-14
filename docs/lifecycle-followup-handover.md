# Challenge Lifecycle 후속 작업 핸드오버 (메인 커밋 변경 대응)

## 1) 배경
- 진행 중이던 lifecycle 정합성 작업 도중 메인 브랜치 기준 커밋 포인트가 변경되어,
  신규 대화/신규 브랜치에서 이어서 작업할 수 있도록 지금까지의 변경 사항을 요약한다.

## 2) 지금까지 반영한 핵심 내용

### 공통 유틸 (`frontend/src/features/challenge/utils/challengeLifecycle.ts`)
- 상태 완료 판정(`isVerificationDayCompleted`)을 대소문자 무관 처리.
- 챌린지 일차 계산(`resolveChallengeDay`)에서 `currentDay` 비정상 값 fallback/클램프 보강.
- 참여일 계산(`countParticipatedDays`)을 완료 레코드 `day` 기준 dedupe 방식으로 보강.
- ID 해석 유틸 추가:
  - `resolveChallengeId` (top-level `challengeId` 우선, nested fallback)
  - `resolveUserChallengeId` (`userChallengeId` 우선, 없으면 challengeId fallback)

### ME 페이지 (`frontend/src/features/me/pages/MEPage.tsx`)
- 오늘 인증 완료 판정을 공통 유틸 기반으로 통일.
- 타임라인 상태 dot 컬러에 status normalize 적용.
- 피드/소개/퀘스트 이동 시 ID 가드 추가(누락 시 toast 에러 처리).
- 개인 퀘스트 제안 map 구성 시 resolved challengeId 기준으로 key 생성 및 빈 key 필터링.
- dedupe/sort/filter에서 resolved userChallengeId 재사용으로 payload shape 차이 대응.

### Today 페이지 (`frontend/src/features/today/pages/TodayPage.tsx`)
- `currentDay > durationDays` 인 케이스를 기간 종료로 판단해 완료 상태로 표시.
- 상태칩을 상황별로 분리:
  - `🏁 챌린지 완료` (기간 종료)
  - `✅ 인증 완료` (오늘 인증 완료)
  - `⏳ 대기` (미완료)
- row key 해석을 shared id 유틸로 통일.

### Profile 페이지 (`frontend/src/features/profile/pages/ProfilePage.tsx`)
- ID fallback 해석을 shared id 유틸로 통일하여 라우팅 안정화.
- completed 버킷 라벨에서 failed를 `종료(미달성)`으로 분리 표기.

### 문서/테스트
- 마스터 플랜 문서에 Phase 1 진행 현황 체크리스트 추가.
- 테스트 파일 추가/확장:
  - `test/challenge-lifecycle-frontend-utils.test.ts`
  - id resolver / day sync / status normalize / participated day dedupe 케이스 보강.
- 함께 수행한 대표 검증:
  - `npm --prefix frontend run build`
  - `npm test -- --runInBand test/challenge-lifecycle-day-sync.test.ts test/challenge-lifecycle-frontend-utils.test.ts`

## 3) 신규 브랜치에서 이어서 할 일 (권장)
1. 최신 메인 기준 새 브랜치 생성 후, 위 항목을 기준으로 필요한 변경만 cherry-pick 또는 재적용.
2. 우선순위
   - (A) shared lifecycle util
   - (B) ME/Today/Profile 연동
   - (C) tests
   - (D) docs 업데이트
3. QA 관점 확인 포인트
   - ME/Profile/Today 동일 챌린지가 동일 bucket으로 보이는지
   - Day/Duration/참여일 수치가 페이지마다 일치하는지
   - failed 완료 라벨/컬러가 일관적인지
   - challengeId/userChallengeId 누락 payload에서도 라우팅이 깨지지 않는지

## 4) 메모
- 이번 문서는 “진행 내용 전달용 요약본”이다.
- 신규 대화에서 최신 메인 기준으로 실제 충돌 상태를 확인한 뒤, 필요한 부분만 최소 단위로 다시 반영하는 전략을 권장.
