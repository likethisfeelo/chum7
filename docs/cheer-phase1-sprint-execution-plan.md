# CHME Cheer Phase 1 스프린트 실행계획 (정합성/버그 안정화)

## 스프린트 목표
- API/도메인 정합성 우선 복구
- 응원권 소모/발송의 데이터 정합성 확보
- 실시간 집계 + 누적 집계 기반 마련
- 단계배포/롤백 가능한 운영 가드레일 확보

## 범위 (In-Scope)
1. 감사 API 정합성 고정
   - 프론트 호출 방식과 백엔드 입력 파싱 통일
   - 에러코드/메시지 표준화
2. 응원권 사용 원자성 강화
   - 티켓 상태 조건부 업데이트(available → used)
   - 동시 요청 충돌 시 단일 성공 보장
3. 통계 1차 모델
   - 실시간 조회 API + 누적 카운터 저장 전략
   - 일/주/월/챌린지 확장을 위한 키 전략 고정
4. 익명성 정책 1차
   - 챌린지 기간 익명 보장
   - 마지막날 이후 공개를 위한 서버 계산 필드 정의
5. 단계배포
   - feature flag 3개 기준 DEV→PROD 점진 배포

## 작업 분해 (WBS)
### A. 계약 정합성
- A1. `POST /cheers/{cheerId}/thank` 요청 스키마 확정 (path cheerId)
- A2. 백엔드 입력 파라미터 이중 허용(단기 호환): path/body
- A3. 실패코드 표준 매핑(400/403/404/409)

### B. 티켓 원자성/경합 처리
- B1. ConditionExpression 기반 상태 전환
- B2. 동시성 테스트 케이스 작성(2중 클릭/재시도)
- B3. 실패 시 사용자 안내 문구 통일

### C. 통계
- C1. 실시간 조회: cheers, tickets 기반 집계
- C2. 누적 저장: owner/day/week/month/challenge 버킷 설계
- C3. 지표 최소셋: sent/received/thanked/immediate/scheduled/ticket(earned|used|expired)

### D. 익명 공개 정책
- D1. reveal 가능 시각 계산 유틸 정의
- D2. 조회 응답에서 `isRevealed` 계산 반환

### E. 배포/관측
- E1. flag: `cheer.api.v2_contract`, `cheer.stats.bucketed`, `cheer.identity.reveal_on_last_day`
- E2. 메트릭: 성공률/충돌률/에러율/평균지연
- E3. 롤백 런북 문서화

## 완료 기준 (DoD)
- 감사 API 회귀 케이스 통과
- 티켓 중복 사용 0건(동시성 테스트 기준)
- 통계 API 응답과 실제 카운트 샘플 10건 이상 일치
- 익명/공개 정책 테스트 시나리오 통과
- DEV 배포 후 에러율 임계치 이하

## 리스크
- 과거 데이터에 challenge 종료시각 부재
- ticket status 인덱스 사용량 급증 시 hot key
- 프론트 구버전 호출과의 호환성

## 확정 의사결정 (반영 완료)
1. 감사 API 최종 경로: **B안 채택**
- `POST /cheers/{cheerId}/thank`
- 이유: `/cheers/{cheerId}` 리소스 패턴(삭제 API 등)과 일관성 유지, cheerId 참조 방식 단일화

2. 통계 저장 전략: **A안 채택**
- DynamoDB 단일 `CheerStats` 버킷 테이블 기반 원자적 카운터
- 이유: 무료 티어/운영 복잡도/실시간 정합성 관점에서 현 단계 최적

3. 익명 공개 기준 시점: **B안 채택**
- 챌린지 종료 처리 완료 이벤트 시점에 공개 전환
- 이유: Day7 자정 부근 레이스 컨디션 방지, 도메인 이벤트 순서 보장

## 확인사항 (최종 확인 필요)
1. 감사 API 전환 방식
- 최적안 A: 기존 `POST /cheer/thank` 유지 + 신규 경로 병행(2주 deprecate)
- 최적안 B: 즉시 `POST /cheers/{cheerId}/thank` 단일화(권장)

2. 통계 카운터 갱신 시점
- 최적안 A: 발송/감사 처리 Lambda 내부 동기 `ADD` 업데이트(권장)
- 최적안 B: 공통 유틸로 추상화 후 각 핸들러에서 호출(확장성 우수)

3. 공개 전환 이벤트 트리거
- 최적안 A: challenge lifecycle `completed` 전환 이벤트 기준(권장)
- 최적안 B: Day7 인증 성공 + 관리자 종료 확인 2단계 기준(운영 통제 강화)
