# Cheer Rate Limit Phase5 옵션 검토 (Lua·Redis·멀티리전)

## 목적
- 현재 DynamoDB atomic counter 기반 근사 전략(`sliding_window_approx`/`token_bucket_approx`)의 확장 한계를 보완한다.
- burst 트래픽과 멀티리전 active-active 시나리오에서 더 안정적인 throttling 품질을 확보한다.

## 후보안

### A. Redis + Lua 원자 스크립트
- 구조: ElastiCache Redis(또는 MemoryDB) + Lua script로 원자적 토큰 차감.
- 장점
  - 단일 round-trip으로 정확한 token bucket/sliding log 구현 가능
  - 높은 QPS/낮은 지연
- 단점
  - 캐시 인프라 운영 복잡도 증가
  - 장애 시 fallback 경로 명확화 필요

### B. DynamoDB Global Table + 보수적 버킷 정책
- 구조: 기존 로직 유지, 리전별 버킷 분리 + conservative budget 적용.
- 장점
  - 기존 코드/운영 모델 재사용 가능
  - 비용 예측 용이
- 단점
  - 리전 간 최종일관성으로 strict fairness 어려움
  - 순간 burst 제어 정밀도 낮음

### C. 하이브리드(Primary Redis + Dynamo fallback)
- 구조: Redis 우선, 실패 시 Dynamo atomic fallback.
- 장점
  - 고QPS 정밀도 + 장애 내성 균형
  - 점진적 롤아웃 가능
- 단점
  - 구현 복잡도 증가(이중 모드 관측/알람 필수)

## 권장 진행안
1. DEV에서 A안 PoC (reply/react 합산 95p latency, 허용오차, 비용 측정).
2. 실패 모드 검증 후 C안 fallback 경로를 feature flag로 도입.
3. PROD는 단계 배포(5% → 20% → 50% → 100%), 기존 Dynamo 경로 즉시 롤백 가능하도록 유지.

## 검증 지표
- `CheerReplyClientError`, `CheerReactClientError` 중 429 비율
- handler latency p95 변화
- rate-limit false-positive/false-negative 샘플 점검
- 리전 장애 시 fallback 전환 시간

## 보류 이슈
- 멀티리전 사용자 키 샤딩 규칙 확정
- Redis 장애 주입(GameDay) 자동화
- 보안/네트워크(서브넷, SG, KMS) 표준 템플릿 정리
