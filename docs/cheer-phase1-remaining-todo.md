# Cheer Phase 1+ 확장 후 남은 TODO

## 완료 범위(이번 반영)
- 공개 인터랙션 1차: `POST /cheers/{cheerId}/reply`, `POST /cheers/{cheerId}/reaction`
- 인터랙션 레이트 리밋 1차: reply/reaction 분당 요청 제한(환경변수 기반)
- 분산 안전 레이트 리밋 2차: `CHEER_RATE_LIMITS_TABLE` atomic counter + fallback
- 레이트 리밋 3차: atomic table 기반 sliding window 근사치 적용(현재+이전 버킷 가중치)
- 통계 API 확장: `GET /cheers/stats` with `period=all|day|week|month|challenge`
- CheerStats 하이브리드 조회: bucket 우선 + 실시간 fallback(`source` 필드 제공)
- CheerStats 적재 파이프라인 1차: 배치 materializer Lambda + 1시간 스케줄 트리거
- materializer 실패 재처리 기반: UnprocessedItems 재시도/백오프 + dry-run + 범위 백필(fromIso/toIso)
- materializer 실행 제어 2차: scan segmentation(totalSegments/segmentIndex) + maxScanPages/scanPageSize
- CloudWatch 에러 알람 베이스라인: reply/react/stats 에러 로그 메트릭 필터+알람
- CloudWatch 운영 대시보드 1차: 에러카운트/latency p95/source mix/materializer invocations·errors 위젯
- CloudWatch 운영 대시보드 2차: reply/react/stats 요청·성공·에러유형(429/5xx) 분리 위젯
- CheerStats 운영 런북/백필 스크립트 표준화(`scripts/cheer-stats-backfill.*`, runbook 문서)
- `period=challenge` 검증 강화: challenge 존재 + 참여자 접근 검증
- 투데이 페이지 UX 확장: 리액션/답장 UI + 기간 필터 통계 카드

## 남은 TODO

### P0 (바로 다음)
1. materializer 장기운영 튜닝(스케줄 주기 자동화/세그먼트 병렬 오케스트레이션)
2. 레이트 리밋 4차(토큰 버킷/분산 Lua·Redis 옵션 검토)
3. 대시보드 템플릿화(stage별 공통 위젯 모듈)

### P1 (이번 스프린트 내)
1. 프론트에서 period 입력 UX 개선(week picker, month picker)
2. 답장 수정/삭제 정책 확정(현재는 1회 작성 후 고정)
3. sender 측 조회 페이지에서 reply/reaction 표시 강화

### P2 (차기)
1. 익명→공개 전환 정책과 reply/reaction 노출 규칙 연동
2. `/cheers/stats`를 CheerStats 버킷 테이블로 이관
3. 공개 인터랙션(스레드 답장/다중 리액션) 확장

## 릴리즈 체크
- feature flag 단계 배포 준수: DEV 100% → 내부계정 5% → 20/50/100%
- 롤백 기준: 오류율/지연/티켓 불일치/응답 포맷 깨짐
