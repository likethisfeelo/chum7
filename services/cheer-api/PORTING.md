# cheer 도메인 이식 기록

레거시 `backend/services/cheer/*` + `infra/stacks/cheer-stack.ts` → `services/cheer-api`(동기 API)
+ `services/workers/cheer-scheduler`(5분 스케줄 발송 워커). 동작 기준 문서: `docs/cheer-latest.md`
(점수 적립과 알림 발송의 분리 원칙).

## 라우트 매핑

| 레거시 | 신규 | 비고 |
|---|---|---|
| POST /cheer/send-immediate, 인증 submit 내 createAutoCheer | POST /ch/cheers | immediate/scheduled 통합, scheduledTime=목표시각−delta, day 필드 포함 |
| GET /cheer/get-targets | GET /ch/cheers/targets | challenges 테이블 읽기 전용 (문서화된 예외) |
| GET /cheer/get-my | GET /ch/cheers/my | 수신=gsi1 RECV#, 발신=SENDER 프로젝션 아이템 |
| POST /cheers/:id/reaction, /reply, /thank | POST /ch/cheers/:cheerId/reaction·reply·thank | 리액션 레이트리밋: 카운터 아이템 상시 사용 (레거시의 env 미설정 시 스캔 폴백 결함 제거) |
| GET /cheer/get-scheduled | GET /ch/scheduled | |
| POST /cheer/cancel-scheduled | POST /ch/scheduled/:cheerId/cancel | pending 조건부 |
| chme-*-cheer-send-scheduled (5분 EventBridge) | workers/cheer-scheduler | 아래 |

## cheer-scheduler 동작 (cheer-latest.md 준수)

gsi2 `SCHED#pending` + `scheduledTime<=now` Query →
- 수신자 해당 day 완료(`CHAL#<id>/UC#<receiverId>` progress[day].status==='success')
  → `status=receiver_completed` + 발신자 참여에 `ADD thankScore :1`
  (**challenges 테이블 크로스 도메인 쓰기 — 레거시 동작 승계, 문서화된 예외**)
- 미완료 → `status=sent` + `publishEvent('cheer.delivered')` (알림은 notification-worker가 처리)
- 실패/재시도 초과 → `DLQ#<cheerId>` 아이템(ttl) 이동. 판정 로직은
  `src/domain/send-decision.ts` 순수 함수 (레거시 test/backend/send-scheduled.test.ts 이식).

## 미이식 (사유)

- **응원권(티켓) 발급·소비 전체** — PRODUCT_SPEC v2에서 폐지 확정. 이식 안 함.
- **데드레터 운영 API**(list/get/stats/requeue) — admin-api 소관 (3차 이식).
- **cheer-stats-materializer**(Step Functions 통계 집계) — Phase 2 후속. 프로필 통계
  노출 전까지 미가동으로 무방.
- **CloudWatch 대시보드/알람 위젯** — ObservabilityStack에서 재구성 예정.

## 크로스 도메인 접근 (porting-guide §4 등록)

- cheer-api: CHALLENGES_TABLE **read-only** (get-targets 그룹 매칭, 참여 확인)
- cheer-scheduler: CHALLENGES_TABLE **read + thankScore ADD 쓰기** (레거시 승계)
