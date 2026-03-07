# CHME Cheer Phase 2 아키텍처 고도화 계획

## 목표

> 실행 우선순위/라이브 게이트는 `docs/cheer-phase2-live-readiness-plan.md`를 기준으로 운영합니다.

- 예약 응원 정식화
- 실패 재시도/백오프/DLQ 도입
- 기간 기반 공개 인터랙션 정책 확장

## 핵심 산출물
1. 예약 응원 명세 고정
   - `scheduledTime = receiverTargetTime - senderDelta`
   - `pending -> sent/failed` 상태 머신 명확화
2. 예약 발송 신뢰성
   - retryCount, nextRetryAt, deadLetterReason 필드 추가
   - 지수 백오프 및 최대 재시도 횟수 설정
3. 인터랙션 확장
   - 마지막날 이후 감사 외 리액션 확장 가능한 스키마 준비
4. API 확장
   - received/sent/stats에 기간/챌린지 필터와 페이징 표준화

## 상세 설계
### 데이터
- Cheers: retryCount, failureCode, revealAvailableAt(권장)
- DLQ: 실패 이벤트 보관(재처리 가능)

### 프로세스
- 예약 생성 시 pending 저장
- 스케줄 트리거 Lambda 발송 시도
- 성공: sentAt 기록, 메트릭 증가
- 실패: retry 정책 후 dead-letter 이동

## 완료 기준
- 예약 발송 성공률 목표치 달성
- 재시도 로직 E2E 통과
- 기간/필터 API 응답시간 목표치 만족

## 확정 의사결정 (반영 완료)
1. 재시도 정책: **A안 채택**
- 최대 3회, 1m/5m/15m 백오프
- 이유: 응원 메시지의 시간 민감성(목표 시각 N분 전) 보존

2. DLQ 구현 방식: **B안 채택**
- DynamoDB dead-letter 테이블 사용
- 테이블명: `chme-{stage}-cheer-dead-letters`
- PK: `cheerId`
- 속성: `failureCode`, `deadLetterReason`, `failedAt`, `retryCount`, `originalScheduledTime`

3. 예약 취소 정책: **A안 채택**
- 발송 5분 전 cut-off
- 이유: 취소 API vs 발송 Lambda 경합 단순화, 운영 예측성 향상

## 구현 메모
- 예약 취소 검증 예시
```ts
const cutoffTime = new Date(scheduledTime).getTime() - 5 * 60 * 1000;
if (Date.now() > cutoffTime) {
  return response.error(400, 'CANCELLATION_WINDOW_CLOSED', '발송 5분 전에는 취소할 수 없어요');
}
```

## 확인사항 (최종 확인 필요)
1. 재시도 실패 후 처리
- 최적안 A: 즉시 dead-letter 적재 후 운영자 대시보드 노출(권장)
- 최적안 B: dead-letter 적재 + 하루 1회 자동 재처리 배치

2. dead-letter 조회 API
- 최적안 A: 관리자 전용 목록/상세 API 제공(권장)
- 최적안 B: CloudWatch Logs Insights 기반 운영 조회로 시작

3. 취소 cut-off 예외
- 최적안 A: 예외 없음(단순 정책 유지, 권장)
- 최적안 B: 관리자 계정에 한해 긴급 취소 허용

## 문서 적재 연동(Phase 2 마무리)
- 운영/릴리즈 증적 문서는 라이브 레디니스 실행안 8장을 기준으로 별도 분리 관리한다.
- 아키텍처 문서는 변경 설계 근거만 유지하고, 드릴/운영 증적/성능 리허설은 `docs/ops/*`에 누적한다.
- Phase 2 마무리 판단은 구현 완료 + 운영 증적(드릴/게이트/성능) 충족으로 본다.
