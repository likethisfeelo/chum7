# 커머스 v0 — PG 계약 전 수동 운영 체계

PAYMENT_SPEC의 M1 이전 단계. **PG 없이 유료 챌린지를 열기 위한 두 가지 경로**를 제공한다.
PG 도입 시 주문 상태 머신은 그대로 두고 `awaiting_deposit → paid` 전이의 주체만
어드민 수동 확인 → PG 웹훅으로 바뀐다 (`/hooks/pg` 라우트 추가).

## 두 가지 경로

### 1) 쿠폰 (입장권) — 슈퍼어드민 발급
```
슈퍼어드민: POST /pay/admin/coupons { challengeId | 'ANY', issuedToUserId?, count, expiresAt?, memo }
  → CHME-XXXXXXXX 코드 발급 (특정 멤버 지정 시 그 사용자만 사용 가능)
유저:      POST /pay/orders { challengeId, method: 'coupon', couponCode }
  → 쿠폰 active→redeemed 조건부 전환 (동시 사용 방지) → 주문 즉시 paid
  → order.paid 이벤트 → 인앱/푸시 알림
유저:      POST /c/challenges/:id/join { ..., orderId }  → 참여 확정
```

### 2) 수동 입금 확인 (무통장)
```
유저:      POST /pay/orders { challengeId, method: 'manual_deposit', depositorName }
  → 주문 awaiting_deposit (72시간 내 미확인 시 만료)
슈퍼어드민: GET /pay/admin/orders?status=awaiting_deposit  → 입금 대기 큐 확인
           POST /pay/admin/orders/:id/confirm  → paid + order.paid 이벤트 + 알림
           POST /pay/admin/orders/:id/reject   → rejected + order.rejected 이벤트
유저:      join { orderId } → 참여 확정
```

## 설계 원칙 (PAYMENT_SPEC 승계)

- **원장(append-only)**: 모든 상태 전이가 `ORDER#<id>/LEDGER#<ts>` 아이템으로 기록.
  수정·삭제 API 없음.
- **감사 로그**: 쿠폰 발급/회수, 입금 확인/거절 등 어드민 행위 전부 OPS 테이블
  `AUDIT#<YYYY-MM>` 기록 (행위자·대상·상세).
- **상태 전이는 조건부 Update만**: 중복 확인·동시 쿠폰 사용이 경합해도 한 요청만 성공.
- **참여 확정은 challenge-api 소관**: commerce는 자격(paid)만 만들고, 참여 생성은
  join 라우트가 주문을 **읽기 전용**으로 검증 후 수행 (개인 목표 등 참여 요건 유지).
- 권한: `/pay/admin/*`은 Cognito `admins` 그룹 전용 (`requireGroup`).

## 크로스 도메인 접근 (porting-guide §4 등록)

- commerce-api → CHALLENGES_TABLE **read-only** (주문 생성 시 가격·모집 상태 확인)
- commerce-api → OPS_TABLE **write** (감사 로그)
- challenge-api → COMMERCE_TABLE **read-only** (join 시 paid 주문 검증)

## v0 한계 (PG 도입 시 해소)

- 환불 없음 (paid는 종료 상태) — 예외 환불은 어드민이 수동 처리 후 원장에 기록 권장
- 입금 계좌 안내는 챌린지 소개문에 기재하는 운영 관행으로 처리 (시스템 필드 아님)
- 금액 검증은 어드민 육안 확인 — PG 도입 시 서버 금액 대조로 대체
