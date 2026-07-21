# 시간 정책 (Time Policy) — 챌린지 라이프사이클·인증 시각의 단일 규칙

보고된 문제(모집 예약 시각에 자동 오픈 안 됨, 예약보다 이른 수동 마감/시작의 충돌,
인증 업로드 서버 시각 오류)를 해소하기 위한 단일 정책. 구현의 진실 원천은
`packages/core/src/challenge/lifecycle.ts`의 `resolveEffectiveLifecycle`이며,
**워커와 API 읽기 계층이 같은 함수를 사용한다.**

## 규칙

| # | 규칙 | 해소하는 증상 |
|---|------|----------------|
| **R1** | **자동 전이는 앞으로만 간다 (forward-only).** 수동 전이가 예약보다 먼저 일어나면 지나간 예약 시각은 영구히 no-op — 되돌리거나 중복 전이하지 않는다 | 예약 마감보다 먼저 수동 마감 / 예약 시작보다 먼저 수동 시작해도 충돌 없음 |
| **R2** | 모집 오픈(`recruitOpenAt`)·마감(`recruitCloseAt`)은 **시각(ISO)** 비교, 시작·완료는 챌린지 타임존 기준 **날짜** 비교 | 마감 "시각"과 시작 "날짜"의 단위 혼동 제거 |
| **R3** | **조기 수동 시작 시 유효 시작일이 예정일을 대체한다.** `actualStartAt`을 스탬프하고 참여자 `startDate`를 재산정 — Day 계산·완주 판정·구제(Day6)는 항상 유효 시작일 기준 | 조기 시작 시 Day가 음수/0이 되거나 예정일 기준으로 어긋나는 문제 |
| **R4** | **표시는 즉시, 전이는 10분 내.** 워커(lifecycle-manager)가 10분 주기로 실제 전이를 수행하고, API는 응답에 `effectiveLifecycle`(지금 이 순간의 상태)을 병기해 워커 지연을 사용자에게 보이지 않게 한다 | "시간이 되어도 뜨지 않는" 문제 |
| **R5** | **인증 시각 이원화 유지 + 스큐 허용.** `performedAt`(사용자 주장)·`uploadAt`(서버 수신). 기기 시계 오차로 performedAt이 서버보다 최대 5분 미래면 **에러 대신 서버 시각으로 클램프** | 인증 업로드 시 서버 타임 계산 오류 보고 |
| **R6** | 하루의 기준: 인증은 **사용자 타임존**(`x-user-timezone` 헤더, 검증 후 사용), 챌린지 라이프사이클·세계(오늘탭) 집계는 **챌린지 타임존(기본 Asia/Seoul)** | 타임존 경계(자정 전후) 오판 |

## 상태·필드 정리

```
draft ──(수동 publish 또는 recruitOpenAt 경과)──▶ recruiting
recruiting ──(수동 close-recruiting 또는 recruitCloseAt 경과)──▶ preparing
preparing ──(수동 start 또는 startDate 도래[+시작확인 게이트])──▶ active
active ──(유효 시작일 + durationDays 경과)──▶ completed ──▶ archived
```

| 필드 | 의미 |
|------|------|
| `recruitOpenAt` / `recruitCloseAt` | 예약 오픈·마감 시각 (레거시 `recruitingStartAt`/`recruitingEndAt` 별칭 인식) |
| `challengeStartAt` | 예정 시작 시각 |
| `actualStartAt` | **유효 시작** — 수동 조기 시작 시 now, 자동이면 예정 시각 (if_not_exists) |
| `startConfirmedAt` | 시작 확인 게이트 통과 시각. **수동 시작은 확인으로 간주해 동시 스탬프** |
| `recruitOpenedAt` / `recruitClosedAt` | 실제 오픈·마감된 시각 (감사·표시용) |
| `effectiveLifecycle` (응답 전용) | 지금 이 순간 도달해 있어야 할 상태 — 저장값과 병기 |

## 수동 전이 API (리더/생성자)

- `PATCH /c/challenges/:id/publish` — 모집 오픈. **예약 시각 전에도 허용** (기존 차단 제거)
- `POST /c/challenges/:id/close-recruiting` — 조기 모집 마감
- `POST /c/challenges/:id/start` — 조기 시작: `actualStartAt`·`startConfirmedAt` 스탬프,
  참여자 활성화(승인분 active + `startDate`=오늘, 미승인 자동 거절) — 워커의 active 진입 규칙과 동일

## 워커 (lifecycle-manager)

- 주기 1시간 → **10분**. 스캔 대상에 **draft 포함** (예약 오픈 발화 — 기존 미포함이 증상①의 원인)
- 판정은 core `resolveEffectiveLifecycle` + `transitionSteps` (API와 동일 규칙)
- 전이는 조건부 Update(현재 상태 일치)라 수동 전이와 경합해도 한쪽만 성공

## 인증 시각 검증 파이프라인 (challenge-api)

```
performedAt 수신 → (R5) +5분 내 미래면 now로 클램프 → 미래면 400 FUTURE_PRACTICE_TIME
→ 사용자 타임존 기준 certDate 계산 → 당일 아니면 PRACTICE_TOO_OLD
→ day 윈도우: |요청 day − 서버 계산 day| ≤ 1 (타임존 경계 보정)
→ 서버 계산 day의 기준 startDate는 참여 레코드의 유효 시작일 (R3)
```
