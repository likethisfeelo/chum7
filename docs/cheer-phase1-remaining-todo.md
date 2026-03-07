# Cheer Phase 1+ 확장 후 남은 TODO

## 완료 범위(이번 반영)
- 공개 인터랙션 1차: `POST /cheers/{cheerId}/reply`, `POST /cheers/{cheerId}/reaction`
- 인터랙션 레이트 리밋 1차: reply/reaction 분당 요청 제한(환경변수 기반)
- 분산 안전 레이트 리밋 2차: `CHEER_RATE_LIMITS_TABLE` atomic counter + fallback
- 레이트 리밋 3차: atomic table 기반 sliding window 근사치 적용(현재+이전 버킷 가중치)
- 레이트 리밋 4차: token bucket 근사 전략 추가(`CHEER_RATE_LIMIT_STRATEGY=token_bucket_approx`)
- 통계 API 확장: `GET /cheers/stats` with `period=all|day|week|month|challenge`
- CheerStats 하이브리드 조회: bucket 우선 + 실시간 fallback(`source` 필드 제공)
- CheerStats 적재 파이프라인 1차: 배치 materializer Lambda + 1시간 스케줄 트리거
- materializer 실패 재처리 기반: UnprocessedItems 재시도/백오프 + dry-run + 범위 백필(fromIso/toIso)
- materializer 실행 제어 2차: scan segmentation(totalSegments/segmentIndex) + maxScanPages/scanPageSize
- materializer 스케줄 자동화 3차: EventBridge 분 단위 주기 + segment fan-out 오케스트레이션
- materializer 오케스트레이션 4차: Step Functions Map + LambdaInvoke retry 체계
- materializer 관측 5차: Step Functions orchestrator 실패 알람 + 실행지표 위젯
- materializer 관측 6차: Step Functions 실패 이벤트 SNS 알림 연동
- materializer 운영 7차: 백필 스크립트 실패 세그먼트 재실행 옵션 지원
- CloudWatch 에러 알람 베이스라인: reply/react/stats 에러 로그 메트릭 필터+알람
- CloudWatch 운영 대시보드 1차: 에러카운트/latency p95/source mix/materializer invocations·errors 위젯
- CloudWatch 운영 대시보드 2차: reply/react/stats 요청·성공·에러유형(429/5xx) 분리 위젯
- CloudWatch 운영 대시보드 3차: stage별 공통 위젯 템플릿 함수(buildCheerOpsWidgetRows) 적용
- CloudWatch 운영 대시보드 4차: 위젯 템플릿 외부 모듈(`infra/stacks/observability/cheer-dashboard-widgets.ts`) 분리
- 대시보드 위젯 카탈로그 5차: 운영 표준 문서(`docs/cheer-observability-widget-catalog.md`) 추가
- CheerStats 운영 런북/백필 스크립트 표준화(`scripts/cheer-stats-backfill.*`, runbook 문서)
- `period=challenge` 검증 강화: challenge 존재 + 참여자 접근 검증
- 투데이 페이지 UX 확장: 리액션/답장 UI + 기간 필터 통계 카드
- Admin Docs Hub 1차: 런북/백필 명령/QA 체크리스트를 `/admin/docs`에서 조회 가능
- Admin Docs Hub 2차: 역할기반 접근제어(Admin/Ops + allowlist email) 및 접근거부 페이지 적용
- Admin Docs Hub 3차: 운영 파라미터 입력형 Command Builder(검증+복사) 적용

## 남은 TODO

### P0 (바로 다음)
1. 레이트 리밋 5차(분산 Lua·Redis/멀티리전 옵션 검토)
   - 레이트 리밋 5차 제안서 문서화: `docs/cheer-rate-limit-phase5-options.md`
2. ✅ materializer 워크플로우 운영자동화(실패 세그먼트 재실행 + SNS 알림 스크립트 추가)
3. ✅ 대시보드 위젯 변경 관리 자동화(카탈로그 동기화 lint 스크립트 추가)

### P1 (이번 스프린트 내)
1. ✅ 프론트에서 period 입력 UX 개선(week/day/month picker 적용)
2. ✅ 답장 수정/삭제 정책 확정(1회 작성 후 수정/삭제 불가로 운영)
3. ✅ sender 측 조회 페이지에서 reply/reaction 표시 강화(투데이 페이지 반영)

### P2 (차기)
1. 익명→공개 전환 정책과 reply/reaction 노출 규칙 연동
2. `/cheers/stats`를 CheerStats 버킷 테이블로 이관
3. 공개 인터랙션(스레드 답장/다중 리액션) 확장

## 릴리즈 체크
- feature flag 단계 배포 준수: DEV 100% → 내부계정 5% → 20/50/100%
- 롤백 기준: 오류율/지연/티켓 불일치/응답 포맷 깨짐
