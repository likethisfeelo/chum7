# Daily Reset / Yard Population 버그 수정 목표 및 실행 계획

## 1) 문제 정의
- 증상 A: 챌린지 진행 상태가 실제 날짜가 넘어가도 `Day 1`에 고정되어 보임.
- 증상 B: 하루가 지나면 생성되어야 하는 `마당(야드)` 데이터가 비어 있으며, 노출 대상이 뜨지 않음.
- 맥락상 의심 영역: 일일 리셋 스케줄러, 날짜 키 계산(타임존), 사용자별 진행일 계산, 마당 집계/조회 로직.

## 2) 목표(Definition of Done)
1. 날짜가 바뀌면 사용자 진행 일차(`currentDay`)가 정책에 맞게 증가한다.
2. 날짜 변경 이후 마당 데이터가 정상 생성/조회되어 UI에서 항목이 보인다.
3. 스케줄 기반 처리(배치/이벤트)가 누락 없이 실행되며 실패 시 재시도·관측이 가능하다.
4. 위 동작을 자동 테스트(단위 + 통합 경로 검증)로 재현 및 회귀 방지한다.

## 3) 가설 기반 원인 후보
- 스케줄 트리거 미실행
  - EventBridge/Cron 구성 누락, disabled 상태, 잘못된 타겟/권한, 잘못된 배포 stage 참조.
- 날짜 경계 계산 오류
  - UTC 기준과 KST(서비스 기준일) 불일치로 `dateKey`가 고정되거나 하루가 늦게 반영됨.
- 진행 일차 계산 로직 결함
  - `startDate`/`joinedAt` 기준 오프셋 계산 시 floor/ceil/음수 보정 문제.
- 마당 생성 파이프라인 누락
  - Day rollover 이후 populate 함수 호출 경로가 끊기거나 조건문에서 조기 return.
- 조회 필터 과도 제한
  - `status`, `day`, `lifecycle` 필터가 실제 저장값과 불일치해 결과 0건 반환.

## 4) 수정 전략
### Phase 1. 관측/재현 고정
- 로그 포인트 추가
  - 일일 리셋 시작/종료, 처리 건수, 실패 건수, 기준 `dateKey`, timezone, 대상 challenge 수.
  - 마당 populate 시작/종료, 생성 건수, skip 사유.
- 로컬/스테이징 재현 시나리오 작성
  - `T0=23:58`, `T1=00:02` 경계 테스트로 Day 증가 여부와 마당 생성 여부 확인.

### Phase 2. 날짜/일차 계산 로직 정합화
- 단일 유틸로 기준일 계산 통합
  - 예: `getServiceDateKey(now, tz='Asia/Seoul')`.
- `currentDay` 계산 공식을 단일 함수로 통합
  - `day = clamp(diffInServiceDays(startDate, now)+1, 1, challengeDuration)`.
- 스케줄러/조회 API 모두 동일 유틸 사용하도록 리팩터링.

### Phase 3. 스케줄링/배치 실행 경로 복구
- 인프라 스택 점검
  - daily reset용 규칙(Cron) + 타겟 Lambda + invoke 권한 + DLQ/재시도 확인.
- 핸들러 실행 idempotency 보장
  - 동일 날짜 중복 실행 시 중복 업데이트 방지 조건 추가(conditional write).

### Phase 4. 마당 populate 경로 복구
- day rollover 직후 populate 진입 보장
  - reset 완료 후 populate 트리거 or lazy-populate fallback(조회 시 미존재면 생성).
- 데이터 모델/필터 정렬
  - 저장 필드(`day`, `status`, `visibleAt`)와 조회 쿼리 조건 정합성 맞춤.

### Phase 5. 테스트/릴리즈 안전장치
- 단위 테스트
  - 날짜 경계(UTC↔KST), Day 1→2 전환, 말일/윤년 경계.
- 통합 테스트
  - reset 실행 후 API에서 `currentDay` 증가 및 yard 항목 존재 검증.
- 운영 체크리스트
  - CloudWatch 대시보드/알람(실패율, 처리량, 빈 결과율) 추가.

## 5) 우선순위 실행 순서 (실제 작업 지시)
1. 스케줄러가 실제로 도는지부터 확인(인프라/권한/disabled 여부).
2. 날짜 키/일차 계산 유틸 단일화 후 관련 로직 교체.
3. 마당 populate 트리거 경로와 조회 필터를 맞춰 빈 결과 문제 제거.
4. 회귀 테스트 추가 후 스테이징에서 날짜 경계 리허설.
5. 프로덕션 반영 시 모니터링 알람과 롤백 조건 명시.

## 6) 수용 기준 (QA)
- 기준일 변경 후 10분 이내 대상 사용자 `currentDay`가 `N+1`로 반영된다.
- 동일 조건에서 마당 API 응답이 0건이 아니며, UI 카드/아이템이 노출된다.
- 스케줄러 재실행(중복 실행) 시 데이터 중복/오염이 발생하지 않는다.
- 실패 케이스는 알람으로 탐지되고 재시도로 복구 가능하다.
