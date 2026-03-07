# Cheer 확장 QA 시트 (Reply/Reaction + Stats Filters)

## 1. API QA

### 1-1) Reply API
- [ ] `POST /cheers/{cheerId}/reply` 정상 입력(1~200자) 성공
- [ ] 비로그인 요청 시 401
- [ ] 타인 cheerId로 요청 시 403
- [ ] 동일 cheer 2회 답장 시 409(ALREADY_REPLIED)
- [ ] 단시간 다건 요청 시 429(REPLY_RATE_LIMIT_EXCEEDED)
- [ ] 잘못된 UUID 형식 400
- [ ] malformed JSON 400

### 1-2) Reaction API
- [ ] `POST /cheers/{cheerId}/reaction` 허용 이모지(❤️/🔥/👏/🙌/😊) 성공
- [ ] 비허용 reactionType 400
- [ ] 타인 cheerId로 요청 시 403
- [ ] 동일 cheer 2회 리액션 시 409(ALREADY_REACTED)
- [ ] 단시간 다건 요청 시 429(REACTION_RATE_LIMIT_EXCEEDED)

### 1-3) Stats API
- [ ] `GET /cheers/stats?period=all` 성공
- [ ] `period=day&day=YYYY-MM-DD` 성공/기본값 동작
- [ ] `period=week&week=YYYY-Www` 성공/기본값 동작
- [ ] `period=month&month=YYYY-MM` 성공/기본값 동작
- [ ] `period=challenge` + challengeId 누락 시 400
- [ ] 존재하지 않는 challengeId 요청 시 404
- [ ] 비참여자 challengeId 요청 시 403
- [ ] 응답에 sent/received/thanked/replied/reaction count 포함
- [ ] 응답 `source`가 `bucketed` 또는 `realtime_fallback`으로 반환
- [ ] 배치 materializer 실행 후 bucketed source 응답 비율 확인
- [ ] dry-run 모드 실행 시 write 없이 집계건수 반환 확인
- [ ] fromIso/toIso 범위 백필 실행 시 대상 기간만 반영되는지 확인
- [ ] runbook 절차대로 dry-run → 본실행 순서 수행 기록 남기기

## 2. 프론트 QA (Today)
- [ ] 받은 응원 카드에서 리액션 버튼 노출
- [ ] 리액션 성공 후 카드/통계 즉시 갱신
- [ ] 답장 입력 후 전송 성공 및 카드에 답장 텍스트 고정 노출
- [ ] 통계 period 버튼 전환 시 API 재조회
- [ ] challenge 필터 입력 후 통계 반영

## 3. 회귀 QA
- [ ] 기존 감사(Thank) API 정상 동작
- [ ] 기존 get-my-cheers read-sync 동작 유지
- [ ] 기존 use-ticket 원자성 동작 유지
- [ ] 에러 응답 JSON 포맷 공통 규격 유지

## 4. 운영 체크
- [ ] CloudWatch에서 `Reply cheer error`, `React cheer error`, `Get cheer stats error` 알림 규칙 등록
- [ ] 구조화 로그 키(`path`, `userId`, `cheerId/reactionType`, `period/challengeId`, `latencyMs`) 대시보드 매핑
- [ ] 응답 지연 p95 모니터링(초기 기준선 수립)
- [ ] 배포 직후 1시간/24시간 오류율 추적
