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
| GET /cheers/stats (stats Lambda) | GET /ch/stats/my | 증분 카운터 단건 조회 — §5 |
| chme-*-cheer-stats-materializer (Step Functions 배치) | (폐기) 증분 카운터로 대체 | §5 |
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
- **CloudWatch 대시보드/알람 위젯** — ObservabilityStack에서 재구성 예정.

## §5. 응원 통계 — materializer 배치 → 증분 카운터 대체

레거시 `cheer-stats-materializer`(EventBridge → Step Functions 오케스트레이터 → 세그먼트 Scan
→ BatchWrite 버킷 적재)와 백필 스크립트(`scripts/cheer-stats-backfill.{sh,ps1}`,
`scripts/cheer-materializer-rerun-failed.sh`), `docs/cheer-stats-materializer-runbook.md` 운영
플로우는 **전부 퇴역**. 재설계 규칙(풀스캔 금지)에 따라 액션 시점 증분 카운터로 대체한다.

- 저장: cheer 테이블 `pk=STATS#<userId>` / `sk=META` 단일 아이템, `UpdateCommand ADD`(업서트).
- 조회: `GET /ch/stats/my` (아이템 부재 시 전 카운터 0). 순수 규칙은
  `src/domain/stats-rules.ts`(+테스트), 반영은 `src/repo/stats.ts` best-effort.
- day/week/month/challenge 버킷(`owner#<userId>`/`day#...` 등)은 미이식 — 기간별 통계 화면
  부재. 필요 시 sk 버킷 아이템 추가로 확장 가능.

### 증분 지점

| 액션 | 위치 | 증분 |
|---|---|---|
| 응원 생성 | cheer-api POST /ch/cheers | 발신자 `sentCount+1`, 즉시 발송이면 수신자 `receivedCount+1` |
| 리액션 | cheer-api POST /ch/cheers/:id/reaction | 수신자 `reactionGivenCount+1`, 발신자 `reactionReceivedCount+1` |
| 답장 | cheer-api POST /ch/cheers/:id/reply | 수신자 `replyCount+1` |
| 감사 메시지 | cheer-api POST /ch/cheers/thank | 발신자 `thankedCount+성공건수` |
| 예약 발송 (pending→sent) | cheer-scheduler | 수신자 `receivedCount+1` |
| 수신자 선완료 (pending→receiver_completed) | cheer-scheduler | 발신자 `thankScoreEarned+1`(참여 thankScore ADD 미러) + `receiverCompletedCount+1` |

스케줄러 헬퍼는 크로스 서비스 import 금지에 따라 `workers/cheer-scheduler/src/{domain,repo}`에
자체 보유 (cheer-api와 동일 아이템 갱신).

### 레거시 필드 매핑

| 레거시 materializer | 신규 카운터 | 비고 |
|---|---|---|
| sentCount | sentCount | 동일 |
| receivedCount | receivedCount | 전달 시점(즉시 생성 또는 스케줄러 sent 전이)에 증분 |
| repliedCount | replyCount | 답장한 수신자 관점 |
| reactionCount | reactionGivenCount + reactionReceivedCount | 양방향 합산이던 레거시를 준/받은 쪽으로 분리 |
| thankedCount | thankedCount | 감사 메시지 성공 건수 (isThanked 마킹) |
| immediateCount / scheduledCount | (폐기) | 화면 미사용 — 필요 시 재도입 |
| — | thankScoreEarned / receiverCompletedCount | 신규 (스케줄러 receiver_completed 전이) |

### 멱등성 주의 (v1 허용 오차)

- 카운터 증분은 조건부 상태 전이(생성 Put, pending→sent/receiver_completed, 리액션·답장·감사
  조건부 갱신)가 **실제 성공한 경우에만** 수행 — race/재시도 시 ConditionalCheckFailedException
  이면 증분하지 않음 (명백한 이중 집계 케이스 차단).
- 다만 전이 성공 직후 프로세스 중단·증분 자체 실패(경고 로그 후 무시) 시 소량의 과소/과대
  집계 가능 — v1에서 허용. 정밀 보정이 필요해지면 트랜잭션 또는 스트림 기반으로 보강.
- 관리자 모니터(admin-api cheer-ops)는 본 이식 범위 밖(쓰기 금지 영역)이라 응답 shape 미변경 —
  통계 노출은 admin-api 3차 이식에서 `STATS#<userId>` 조회 추가로 대응.

## 크로스 도메인 접근 (porting-guide §4 등록)

- cheer-api: CHALLENGES_TABLE **read-only** (get-targets 그룹 매칭, 참여 확인)
- cheer-scheduler: CHALLENGES_TABLE **read + thankScore ADD 쓰기** (레거시 승계)
