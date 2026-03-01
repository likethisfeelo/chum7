# Challenge KPI EventBus 고도화 계획 (Future Work)

- 문서 버전: 1.0.0
- 작성일: 2026-03-01
- 상태: **추후 고도화 전용** (현재 스프린트 범위 제외)

## 목표
현재 Lambda 내부 KPI 로그 출력 기반(`console.log`)을 EventBus 기반 비동기 파이프라인으로 확장해,
운영 분석/정책 감사/정산 판단 지표를 안정적으로 적재한다.

## 현재 상태
- 이벤트 포인트는 서비스 코드에 기본 삽입됨.
- 전송 방식은 로그 중심이며, 분석 시스템과의 계약이 느슨함.

## 고도화 범위 (나중에 진행)
1. `trackKpiEvent`를 EventBridge 발행 방식으로 교체
   - 실패 시 본 요청 성공은 유지 (best-effort)
2. 표준 이벤트 스키마 도입
   - `eventName`, `eventVersion`, `actorId`, `challengeId`, `occurredAt`, `metadata`
3. 라우팅/적재 파이프라인 구축
   - EventBridge Rule -> SQS/Kinesis/Firehose -> DWH
4. 운영 안전장치
   - DLQ, 재처리 전략, 샘플링/중복제거 키
5. 리포트 지표 매핑
   - 신청/승인/거절환불/환불요청/환불차단/정산심사/정산확정

## 수용 기준 (고도화 완료 정의)
- API 성공/실패와 KPI 발행 실패가 분리되어야 함.
- 이벤트 누락률 모니터링이 가능해야 함.
- BI 팀에서 사용하는 스키마 버전 계약이 문서화되어야 함.
