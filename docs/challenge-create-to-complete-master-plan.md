# CHME 챌린지 생성 → 완료(뱃지/응원 포함) 통합 기획·개발 계획서

## 0) 문서 목적
- 챌린지 도메인의 전 과정을 **한 장의 기준 문서**로 정리한다.
- 범위: 챌린지 생성(운영자) → 참여(유저) → 일일 인증/추가기록 → 보완(remedy) → 종료/완료 → 뱃지/응원 지급/노출.
- 산출물: 기획 기준, 상태전이, 화면/백엔드 책임, QA, 운영 체크리스트를 하나의 계획으로 통합.

---

## 1) 제품 목표와 성공 기준

### 1.1 제품 목표
1. 유저는 "지금 무엇을 해야 하는지"(참여/인증/보완/완료 상태)를 즉시 이해한다.
2. 운영자는 lifecycle 전이(draft~completed)와 참여자 상태(active/completed/failed)를 예측 가능하게 관리한다.
3. 완주 동기(뱃지/응원/점수)가 흐름 중간과 종료 시점에서 자연스럽게 연결된다.

### 1.2 KPI(권장)
- 참여 전환율: recruiting 상세 진입 대비 join 완료 비율
- Day1 인증율 / Day7 완주율
- 보완 사용률(remedy adoption), 보완 후 회복률
- 응원 사용률(응원권 사용/수신), 완료 탭 재방문율
- 뱃지 획득 후 다음 챌린지 재참여율

---

## 2) 도메인 범위와 역할

### 2.1 액터
- 운영자(Admin): 챌린지 생성/수정/시작확정/종료 운영
- 참여자(User): 참여, 인증, 보완, 응원, 완료 확인
- 리더(Leader): 개인 퀘스트 승인/피드 운영(사용 시)
- 시스템 배치(EventBridge/Lambda): lifecycle 자동 전이, day sync

### 2.2 주요 오브젝트
- Challenge: lifecycle, 기간/시간/정책, 보상 규칙
- UserChallenge: user별 상태(status/phase/currentDay/progress/score)
- Verification: 일일 인증/추가기록(extra)
- Remedy: 실패일 복구 시도
- Cheer: 응원 발송/수신/응원권
- Badge: 완료·성과 기반 뱃지 부여

---

## 3) End-to-End 시나리오 (요약)

### Step A. 챌린지 생성/게시
1. Admin이 챌린지 생성(draft)
2. 모집 일정 도달 시 recruiting
3. 모집 종료 후 preparing
4. 시작 조건 충족 시 active

### Step B. 참여/진입
1. 유저는 recruiting에서만 join 가능
2. 챌린지 타입별 personalGoal/personalTarget 입력
3. preparing 구간은 대기(개인퀘스트 심사 포함 가능)
4. active 전환 후 Day 진행 시작

### Step C. 일일 수행/인증
1. ME/Today에서 오늘 Day 확인
2. 기본 인증 제출(success/failed)
3. 동일 Day 재인증은 extra로 저장(점수 미지급)
4. 진행률/연속일/점수 반영

### Step D. 보완(remedy)
1. 정책(strict/limited/open) 및 시점 검증
2. 허용 시 실패 Day 보완 인증
3. 보완 점수(예: 70%) 반영, 상태 업데이트

### Step E. 응원(동기 강화)
1. 미완료 참여자 대상 응원권 사용
2. 수신자는 오늘 행동 유도 피드백 획득
3. 응원은 참여/인증/완료 흐름의 보조 동기 역할

### Step F. 종료/완료(보상)
1. challenge lifecycle completed 전이
2. userChallenge별 completed/failed 확정
3. 완료 조건 충족 시 뱃지 지급
4. ME completed 탭에서 완료/미달성 구분 노출

---

## 4) 상태전이 기준 (기획 기준선)

## 4.1 Challenge lifecycle
- `draft → recruiting → preparing → active → completed` (+ archived)
- 전이 트리거: 일정, 시작확정(requireStartConfirmation), 종료시각

## 4.2 UserChallenge 분류 우선순위(화면 공통)
1. **완료 우선**: `status=completed|failed` 또는 `phase=completed` 또는 `lifecycle=completed|archived`
2. **시작 전**: `phase=preparing` 또는 `lifecycle=recruiting|preparing`
3. **진행 중**: `phase/status active 계열` 또는 `lifecycle=active`

> 화면 탭 분류(ME/Profile/Planning)는 위 우선순위를 공유해야 함.

## 4.3 Day 계산 원칙
- 기준: `stored currentDay`와 `startDate 기반 elapsedDay`를 함께 고려
- active 상태에서는 `max(stored, synced)` 정책 권장
- 범위: `1..durationDays(+완료 경계 day)`로 보정
- 기간은 `challenge.durationDays` 우선, 없으면 progress 길이 fallback

---

## 5) 기능별 기획 상세

## 5.1 생성/편집(Admin)
- 필수: title, description, category, lifecycle 일정, durationDays, verification type, remedyPolicy
- 선택: personalQuest 설정, 자동승인 여부, start confirmation
- 완료 기준(DoD)
  - draft/recruiting/preparing/active 전환 시 CTA/노출이 일관
  - 잘못된 일정 입력에 대한 운영 가드 존재

## 5.2 참여(Join)
- recruiting 외 상태는 참여 불가 안내 명확화
- challengeType별 입력 조건 안내
- 참여 직후 preparing/active 상태 안내 문구 분리

## 5.3 ME/Today 진행 경험
- 진행중 탭: "지금 인증하기" + "오늘 인증 예정" + "인증 완료"
- 준비중 탭: 시작 전 상태와 개인퀘스트 상태 칩
- 완료 탭: completed/failed 함께 표시, 라벨/컬러 구분
- 참여일 카운트: success/remedy/failed를 참여 처리로 집계

## 5.4 인증/extra
- 기본 인증: 점수/연속일/KPI 반영
- extra 인증: 피드 공개 전환 UX 제공
- 업로드 시간/타입 검증 실패 메시지 표준화

## 5.5 remedy
- 정책/남은 횟수/허용 Day를 UI와 API 모두에서 동일 규칙 적용
- 실패 Day 선택 UX + 차단 사유 명확화

## 5.6 응원(Cheer)
- 대상: 같은 챌린지 미완료 참여자
- 사용: 응원권 1장 소모(정책 기반)
- 노출: 수신 피드백, 누적 응원수, 행동 유도 문구

## 5.7 뱃지/완료 보상
- 완료 확정 시 뱃지 지급(중복/재지급 정책 명시)
- 인증 성공 토스트 및 완료 탭/프로필 뱃지 컬렉션 연계
- 실패 종료도 완료 탭에 남겨 다음 회차 참여를 유도

---

## 6) 개발 계획 (트랙별)

## 6.1 Frontend 트랙
1. 공통 버킷 유틸(시작/진행/완료) 단일화
2. Day/duration/참여일 계산 공통화(ME/Today/Profile)
3. 완료 탭 completed/failed 통합 노출 컴포넌트화
4. 인증/보완/응원 결과 피드백 컴포넌트 통일

## 6.2 Backend 트랙
1. my-challenges 응답의 lifecycle/phase/status/currentDay 정합성 강화
2. lifecycle-manager/day-sync 운영 로그 표준화
3. completion 시 badge grant + cheer side effect 경계 처리
4. 실패/완료 확정 기준을 API 계약으로 문서화

## 6.3 QA/운영 트랙
1. `/ux-plan` 기준 Flow A~E 회귀 시나리오 운영
2. 시작일 경계(타임존/자정) 케이스 집중 테스트
3. failed 챌린지 완료 탭 포함 여부 회귀
4. 응원/뱃지 이벤트 누락 모니터링 대시보드 운영

---

## 7) API/데이터 계약 체크리스트

### 7.1 조회 계약
- `GET /challenges/my?status=active|completed|failed|all`
- 응답 필수: `status`, `phase`, `challenge.lifecycle`, `currentDay`, `startDate`, `progress`, `durationDays`

### 7.2 인증 계약
- `POST /verifications` (기본/extra)
- 응답 권장: `scoreEarned`, `consecutiveDays`, `newBadges`, `cheerOpportunity`

### 7.3 보완/응원 계약
- `POST /verifications/remedy`
- `GET /cheer/targets`, `POST /cheer/use-ticket`
- 실패 사유 코드(정책 차단/횟수 초과/기간 만료) 표준화

---

## 8) 출시 단계 제안

### Phase 1 (안정화)
- 버킷/Day 계산 일관화
- completed+failed 완료 탭 정합
- 핵심 QA 시나리오 자동화

### Phase 2 (동기 강화)
- 인증 피드백(뱃지/응원) UX 고도화
- 리텐션 알림(미인증, 응원 수신, 완료 임박)

### Phase 3 (운영 최적화)
- 운영 대시보드(완주율/보완율/응원효과)
- 정책 실험(A/B: remedy/cheer 문구, 보상 구성)

---

## 9) 리스크와 대응
- 타임존 경계 Day 오차 → 서버 certDate 기준 강제 + 프론트 보조 표시
- 상태 불일치(phase/status/lifecycle) → 버킷 우선순위 규칙 공통화
- 완료 보상 누락(뱃지/응원) → 이벤트 idempotency + 재처리 런북
- 복잡도 상승 → "단일 상태판단 유틸" 원칙으로 중복 제거

---

## 10) 최종 DoD (기획/개발 공통)
1. 생성→참여→인증→보완→완료 전 구간이 문서/화면/API에서 동일한 용어와 기준을 사용한다.
2. ME 기준으로 준비중/진행중/완료 분류가 lifecycle·phase·status와 일치한다.
3. 완료 탭에 completed/failed가 모두 표시되고 라벨이 명확히 구분된다.
4. 완료 시 뱃지 지급, 진행 중 응원 흐름이 사용자에게 확인 가능하다.
5. 운영자가 `/ux-plan`과 로그만으로 전이 이상을 진단할 수 있다.


---

## 11) Phase 기반 상세 개발 실행계획 (권장 8주)

> 아래는 "바로 스프린트 티켓으로 분해 가능한 수준"의 실행안이다.

### Phase 0 — 기준선 동결 & 갭 진단 (0.5주)
**목표**
- 상태/용어/지표의 기준선을 고정해 이후 구현에서 해석 차이를 제거.

**핵심 작업**
- lifecycle·phase·status 우선순위 규칙 확정(문서/코드 공통).
- `currentDay`, `durationDays`, 참여일 카운트 계산식 기준선 확정.
- 기존 화면(ME/Profile/Today/ux-plan)과 API 응답 간 불일치 갭 리스트 작성.

**산출물**
- 기준선 체크리스트 1부
- 갭 백로그(우선순위 P0/P1/P2)

**Gate (완료 조건)**
- PM/FE/BE/QA가 동일한 상태정의표에 사인오프.

---

### Phase 1 — 상태정합/표시정합 안정화 (1.5주)
**목표**
- 유저가 보는 상태(준비중/진행중/완료)가 실제 데이터와 항상 일치.

**Frontend**
- 버킷 분류 유틸 공통화(ME/Profile/Today 재사용).
- `Day X / duration` 및 참여일 집계 표시 공통 컴포넌트화.
- 완료 탭 `completed/failed` 구분 노출(텍스트+색상).

**Backend**
- `GET /challenges/my` 응답 스키마 정합성 점검(status/phase/lifecycle/currentDay).
- day sync 계산 로그 구조화(원인 추적 필드 포함).

**QA**
- 시작일 경계(자정/타임존), 완료 전이, failed 완료 탭 노출 회귀.

**Gate (완료 조건)**
- 상태 오분류 재현 케이스 0건.
- ME/Profile/Today 동일 챌린지 상태 불일치 0건.

---

### Phase 2 — 참여/인증 플로우 완성 (2주)
**목표**
- 생성된 챌린지가 참여부터 인증까지 끊김 없이 동작.

**Frontend**
- Join CTA 상태별 문구/비활성 사유 통일.
- 인증 성공/실패/extra 피드백 컴포넌트 일원화.
- 개인 퀘스트 상태칩 및 다음 액션 링크 정리.

**Backend**
- 인증 입력 검증(시간/타입/중복/extra) 오류코드 표준화.
- 개인 퀘스트 승인/반려/재심 흐름 이벤트 감사로그 점검.

**QA**
- Flow A/B/C 회귀(참여→인증→extra 공개전환).

**Gate (완료 조건)**
- Join→첫 인증 성공까지 핵심 퍼널 이탈 원인 없는 수준.
- 인증 오류 메시지 재현 시 기대 코드 100% 일치.

---

### Phase 3 — 보완(remedy) 정책 완성 (1주)
**목표**
- strict/limited/open 정책이 화면과 서버에서 동일하게 동작.

**Frontend**
- 보완 가능 Day 리스트/차단 사유/남은 횟수 표시 통일.
- 보완 성공 시 점수/상태 변화 피드백 강화.

**Backend**
- 보완 허용조건 순서/코드 표준화(정책·횟수·기간·대상 Day).
- 보완 점수 반영 규칙(예: 70%) 테스트 보강.

**QA**
- Flow D 전수 케이스(정책별 허용/차단 매트릭스) 실행.

**Gate (완료 조건)**
- 정책별 허용/차단 오판정 0건.

---

### Phase 4 — 응원/뱃지/완료 보상 연결 (1.5주)
**목표**
- 동기부여 루프(응원→행동→완료→뱃지)가 끊기지 않도록 완성.

**Frontend**
- 응원 대상/사용결과/수신 피드백 UX 정리.
- 완료 시 뱃지 획득 피드백 + 프로필/완료탭 연계 노출.

**Backend**
- 완료 확정 시 뱃지 지급 idempotency 처리.
- 응원권 사용/잔여/타겟 산정 정합성 검증.

**QA**
- 완료 직전/직후 경계, 뱃지 중복지급, 응원 이벤트 누락 회귀.

**Gate (완료 조건)**
- 완료 이벤트 대비 뱃지 지급 누락 0건.
- 응원 사용/수신 집계 불일치 0건.

---

### Phase 5 — 운영/관측/실험 체계화 (1.5주)
**목표**
- 라이브 운영에서 이상징후를 빠르게 감지하고 실험 가능 상태 확보.

**작업**
- 대시보드: 참여전환/인증율/완주율/보완율/응원효과.
- 경보: day sync 이상, 완료 이벤트 누락, 뱃지 지급 실패.
- 실험: 알림 문구, 응원 타이밍, 보완 안내 카피 A/B 준비.

**Gate (완료 조건)**
- 운영 런북(장애 대응/백필 절차) 완료.
- KPI 리포트 주간 자동 발행.

---

## 12) Phase별 티켓 템플릿 (복붙용)

### Epic 템플릿
- 제목: `[Phase X] {영역} {목표}`
- 배경: 어떤 지표/문제 해결인지
- 범위: In / Out
- 완료조건: Gate 수치 포함

### Story 템플릿
- As-Is:
- To-Be:
- API 영향:
- 화면 영향:
- 테스트 케이스:
- 롤백 전략:

### Task 템플릿
- 구현 파일:
- 체크포인트:
- 검증 명령:
- 증빙(스크린샷/로그):
