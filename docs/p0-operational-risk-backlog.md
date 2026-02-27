# P0 운영 리스크 제거 백로그 (후속 진행용)

> 상태: 보류(사용자 요청에 따라 문서화만 진행)

## 1. Audit/Stats Scan 병목 개선
- `admin/audit/logs`의 Scan 기반 조회를 reviewedAt 기반 Query 구조로 전환.
- 필요 시 `QUEST_SUBMISSIONS_TABLE`에 감사로그 전용 GSI 또는 별도 append-only 감사 테이블 설계.
- 운영 지표(`admin/stats/overview`)에서 대량 Scan을 줄이기 위해 주기적 집계(Materialized view) 도입 검토.

## 2. 운영 관측성 강화
- API별 p95/p99 응답 시간, DynamoDB consumed capacity, throttling 메트릭 대시보드 구성.
- 감사로그 조회 지연 및 지표 집계 실패 알람(SNS/Slack) 연결.

## 3. 토큰/필터 조합 안정성
- `nextToken + mode + filter` 불일치 케이스 회귀 테스트 자동화.
- 잘못된 토큰 재사용 시 사용자 안내 메시지 표준화.

## 4. 배포 안전장치
- GSI 추가/전환 시 단계별 배포 가이드(백필/검증/롤백) 운영 런북 반영.
- 스테이지별 트래픽 리허설 후 프로덕션 승격.
