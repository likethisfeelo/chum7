# CHME 응원 기능 안정화/고도화 실행 계획 (2026.03)

## 배경
사용자 합의사항(정합성/버그 안정화 우선, 응원권 1장=챌린지 내 미인증자 전원 발송, 단계배포 가능)을 반영하여, 기존 스마트 응원 기획 v2.0을 **3단계(안정화 → 구조고도화 → 공개인터랙션)**로 재정렬한다.

---

## 0) 이번 의사결정(확정)

1. 1순위는 정합성/버그 안정화
2. 응원권 1장당 같은 챌린지의 아직 인증하지 않은 전원에게 발송(인원 제한 없음)
3. 감사 API는 우선 정합성만 맞추고 확장은 차기
4. 통계는 실시간 집계 + 누적 저장을 동시 지원(향후 일/주/월/챌린지 단위 확장)
5. 익명성 정책: 챌린지 기간 내 익명, 마지막날부터 실명/실사용자 상호확인 가능
6. 단계배포(Feature Flag, 점진적 라우팅) 허용

---

## 1) 최우선: Phase 1 안정화 (1~2주)

### 1-1. API/도메인 정합성 통일
- 감사 API 계약 정합화
  - 단기: 현재 프론트 호출 형태와 백엔드 파라미터 처리 방식 일치
  - 목표: 에러 없이 감사 처리 + 감사 알림 전달
- 즉시/예약 용어 및 라우트 정리
  - API 명세와 실제 라우트/핸들러 이름 일치
  - 프론트 문구와 백엔드 동작 일치(“즉시 발송” vs “예약 생성” 혼선 제거)

### 1-2. 응원권 소모 원자성 확보
- 응원권 사용 시 중복 소모 방지(조건부 업데이트)
- 발송 레코드 생성 + 티켓 상태 변경의 원자성 강화
- 실패 시 롤백/재시도 기준 명확화

### 1-3. 통계 기반 정리(실시간 + 누적)
- 실시간 계산 API: 최근 상태를 즉시 반환
- 누적 스냅샷 저장:
  - 누적 전체(ALL_TIME)
  - 일/주/월 버킷
  - 챌린지 단위 버킷
- 최소 지표 정의:
  - sent_count, received_count, thanked_count
  - immediate_count, scheduled_count
  - ticket_earned_count, ticket_used_count, ticket_expired_count

### 1-4. 관측성/운영 안전장치
- 에러 코드 표준화(VALIDATION/CONFLICT/FORBIDDEN/NOT_FOUND)
- 구조화 로그(userId, cheerId, ticketId, challengeId, path, latency)
- 배포 전후 비교 대시보드(성공률/오류율/응답시간)

---

## 2) Phase 2 구조 고도화 (2~3주)

### 2-1. 예약 응원 정식화
- 응원권 사용 플로우를 “예약 생성”으로 명확화
- 스케줄 계산식 고정: `scheduledTime = receiverTargetTime - senderDelta`
- 예약 발송 실패 재시도/백오프/데드레터 처리

### 2-2. 익명성 타임라인 정책 구현
- 챌린지 진행 중: sender/receiver 모두 익명 표시
- 챌린지 마지막날부터:
  - 상호 실사용자 확인 가능
  - 인터랙션(감사, 답장/리액션 확장 가능) 오픈
- 정책 스위치(챌린지 상태 기반) 서버 강제 적용

### 2-3. 조회 API 확장
- `/cheers/stats`에 period/day/week/month/challenge 필터 지원
- `/cheers/received`, `/cheers/sent` 페이징 + 기간 필터

---

## 3) Phase 3 제품 확장 (3주+)

- 응원 뱃지 자동 부여 연동(50/100/500, 예약 20회 등)
- 개인화 추천 메시지(자동 생성 + 사용자 커스텀)
- 완주 후 “응원해준 사람들” 인터랙션 UX 강화
- 운영/성능 고도화(대용량 발송, Hot partition 완화)

---

## 4) 데이터/모델 제안

### 4-1. Cheer 집계 저장소(신규)
`CheerStats` 테이블(또는 기존 확장)

키 설계 예시:
- PK: `owner#{userId}`
- SK:
  - `all#summary`
  - `day#2026-03-20`
  - `week#2026-W12`
  - `month#2026-03`
  - `challenge#{challengeId}#all`

값:
- sentCount, receivedCount, thankedCount
- immediateCount, scheduledCount
- ticketEarnedCount, ticketUsedCount, ticketExpiredCount
- updatedAt

### 4-2. 공개 전환 정책 필드(권장)
- Cheer 레코드에 `revealAvailableAt` 또는 `challengeEndAt` 참조 저장
- 조회 시점에서 reveal 여부를 서버에서 계산해 반환

---

## 5) 단계배포 전략

### 5-1. 기능 플래그
- `cheer.api.v2_contract`
- `cheer.stats.bucketed`
- `cheer.identity.reveal_on_last_day`

### 5-2. 롤아웃
1. DEV 100%
2. PROD 내부/테스트 계정 5%
3. PROD 20% → 50% → 100%

### 5-3. 롤백 기준
- 감사 API 실패율 임계치 초과
- 응원권 소모 불일치 감지
- 예약 발송 누락률 임계치 초과

---

## 6) 테스트 시나리오(핵심)

### 안정화 필수 시나리오
1. 응원권 1장 사용 시 같은 챌린지 미완료자 전원 발송
2. 동시 요청 2건에서 티켓 중복 사용 방지
3. 감사 API 정상 처리/중복 감사 충돌 처리
4. 통계 API 실시간/누적 수치 일관성
5. 챌린지 진행 중 익명 노출 보장
6. 챌린지 마지막날 이후 신원 공개 정책 반영

---

## 7) 이번 스프린트 산출물

- API 계약 정합성 패치
- 응원권 사용 원자성 패치
- 실시간+누적 통계 기초 API
- 익명→공개 전환 정책의 서버 측 최소 구현
- 배포/롤백 체크리스트



---

## 8) 확정 의사결정 반영 요약

### Phase 1
- 통계 저장 전략: **DynamoDB 집계 테이블(A안)** 채택
- 감사 API: **`POST /cheers/{cheerId}/thank`(B안)** 채택
- 익명 공개 전환: **종료 처리 이벤트 시점(B안)** 채택

### Phase 2
- 재시도: **3회(1m/5m/15m) A안**
- DLQ: **DynamoDB dead-letter 테이블(B안)**
- 예약 취소: **발송 5분 전 cut-off(A안)**

### Phase 3
- 추천 메시지: **규칙 기반 템플릿(A안)**
- 공개 범위: **챌린지 참여자 한정(A안)**
- 뱃지 알림: **혼합안(중요 즉시 + 나머지 일일 요약)**
