# Cheer Observability Widget Catalog

Cheer 도메인 운영 대시보드(`chme-{stage}-cheer-ops`)의 위젯 표준 카탈로그.

## 1) Error / Latency

### Cheer Error Count (5m)
- 타입: `SingleValueWidget`
- 메트릭: `CheerReplyErrorCount`, `CheerReactErrorCount`, `CheerStatsErrorCount`
- 목적: 핸들러별 5분 에러 총량 빠른 확인

### Cheer Handler Latency p95
- 타입: `GraphWidget`
- 메트릭: reply/react/stats Lambda `metricDuration(p95)`
- 목적: 응답 지연 이상 탐지

## 2) Stats / Materializer

### Cheer Stats Source Mix (5m)
- 타입: `GraphWidget`
- 메트릭: `CheerStatsBucketedSource`, `CheerStatsRealtimeFallbackSource`
- 목적: 버킷 조회 비율 vs 실시간 fallback 비율 추세 확인

### Materializer Invocations/Errors
- 타입: `GraphWidget`
- 메트릭: materializer Lambda invocations/errors + orchestrator failed metric
- 목적: 적재 작업 실행/오류 상태 확인

### Materializer Orchestrator (started/succeeded/failed)
- 타입: `GraphWidget`
- 메트릭: Step Functions `Started`, `Succeeded`, `Failed`
- 목적: 오케스트레이터 워크플로우 상태 전이 확인

## 3) Traffic Split

### Reply Traffic Split (req/success/429)
- 타입: `GraphWidget`
- 메트릭: reply request/success/rate-limit-exceeded
- 목적: 요청량 대비 성공률과 rate-limit 압력 확인

### React Traffic Split (req/success/429)
- 타입: `GraphWidget`
- 메트릭: react request/success/rate-limit-exceeded
- 목적: 리액션 트래픽/제한 압력 확인

### Stats Traffic Split (req/success/5xx)
- 타입: `GraphWidget`
- 메트릭: stats request/success/error
- 목적: 조회 성공률/에러 추세 확인

## 4) 운영 규칙
- 위젯 템플릿 소스: `infra/stacks/observability/cheer-dashboard-widgets.ts`
- 위젯 추가/수정 시:
  1. 템플릿 모듈 수정
  2. `test/cheer-stabilization-guards.test.ts` 가드 문자열 업데이트
  3. 본 카탈로그 문서 업데이트
- 권장 변경 단위: “위젯 1개 + 테스트 + 문서”를 하나의 커밋으로 유지
