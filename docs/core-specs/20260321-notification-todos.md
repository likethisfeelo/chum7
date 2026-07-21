# 알림 관련 할 일 목록

## 1. 알림 목록 페이지네이션

### 현재 상태
- `GET /users/me/notifications` — 최대 20건 고정 반환
- `backend/services/auth/get-notifications/index.ts`에서 `Limit: 20` 하드코딩
- `LastEvaluatedKey` 처리 없음 → 오래된 알림 누락

### 목표
```
GET /users/me/notifications?limit=20&cursor=<base64encodedKey>
→ { notifications: [...], nextCursor: string | null, hasMore: boolean }
```

### 작업 항목
- [ ] `get-notifications/index.ts`: querystring에서 `limit`, `cursor` 파라미터 읽기
- [ ] `cursor`를 Base64 decode → `ExclusiveStartKey`로 사용
- [ ] 응답에 `nextCursor` (Base64 encode된 `LastEvaluatedKey`), `hasMore` 포함
- [ ] `limit` 기본값 20, 최대 50 제한
- [ ] 프론트 연동: 무한스크롤 또는 "더 보기" 버튼

### 변경 파일
- `backend/services/auth/get-notifications/index.ts`
- `infra/stacks/auth-stack.ts` (라우트 변경 없음, 쿼리스트링 자동 지원)

---

## 2. 인증 완료 시 그룹 멤버 알림

### 현재 상태
- A가 인증을 완료해도 같은 챌린지 그룹 멤버(B, C, 리더)에게 아무 알림 없음
- `verification/submit/index.ts`에 그룹 알림 로직 없음

### 목표
```
A가 그룹 챌린지에서 인증 완료
→ 같은 challengeId의 다른 멤버 전원에게 push 알림
   title: "그룹 인증 완료"
   body: "{닉네임}님이 오늘 인증을 완료했어요"
   data: { type: "verification_completed", challengeId, userId }
```

### 작업 항목
- [ ] `verification/submit/index.ts`: 인증 완료 후 `challengeId`로 그룹 멤버 조회
  - `USER_CHALLENGES_TABLE`에서 `challengeId-index` GSI 사용 (또는 `GROUPS_TABLE` 존재 시 활용)
- [ ] 본인(userId) 제외한 멤버 목록 필터링
- [ ] `shared/lib/notification.ts`의 `sendPushNotification` 재사용하여 일괄 발송
- [ ] 챌린지 타입이 그룹(`groupId` 있음)인 경우만 발송 조건 적용
- [ ] 발송 실패 시 인증 자체는 성공으로 처리 (try/catch 격리)

### 확인 필요
- `USER_CHALLENGES_TABLE`에 `challengeId-index` GSI 존재 여부 확인 필요
- 그룹 멤버 수가 많을 경우 Lambda timeout 고려 → SQS 비동기 발송 검토

### 변경 파일
- `backend/services/verification/submit/index.ts`
- (GSI 없으면) `infra/stacks/dynamodb-stack.ts`에 GSI 추가

---

## 3. 알림 전체 읽음 처리 API

### 현재 상태
- 알림 개별 읽음만 가능 (`PATCH /users/me/notifications/{notificationId}/read`)
- 전체 읽음 API 없음

### 목표
```
PATCH /users/me/notifications/read-all
→ { updatedCount: number }
```

### 작업 항목
- [ ] `backend/services/auth/read-all-notifications/index.ts` 신규 생성
  - `userId`로 `isRead = false` 알림 Query
  - `Promise.all`로 일괄 Update (`isRead = true, readAt = now`)
  - 배치 크기 고려 (DynamoDB TransactWrite 25개 제한 → chunking 필요)
- [ ] `infra/stacks/auth-stack.ts`에 Lambda + 라우트 추가
  ```
  PATCH /users/me/notifications/read-all → ReadAllNotificationsFn
  ```
- [ ] `userNotificationsTable.grantReadWriteData(readAllFn)` 권한 추가

### 변경 파일
- `backend/services/auth/read-all-notifications/index.ts` (신규)
- `infra/stacks/auth-stack.ts`

---

## 4. 알림 유형 필터

### 현재 상태
- 알림 타입 구분 없이 전체 반환
- `GET /users/me/notifications` — 필터 쿼리파라미터 없음

### 목표
```
GET /users/me/notifications?type=cheer_received,thank_message
→ 해당 type만 필터링해서 반환
```

### 작업 항목
- [ ] `get-notifications/index.ts`에서 `type` 쿼리파라미터 파싱
- [ ] 방법 A (간단): 조회 후 코드에서 필터링 — 데이터가 적으면 충분
- [ ] 방법 B (확장성): DynamoDB GSI에 `type` 필드 추가 → `type-index`로 Query
  - GSI 추가는 `infra/stacks/dynamodb-stack.ts` 수정 필요
  - 기존 데이터에 `type` 필드 없으면 마이그레이션 필요
- [ ] **권장: 방법 A로 시작** — 알림이 많아지면 방법 B로 전환

### 알림 type 값 목록 (현재 코드 기준)
```
cheer_received       - 응원 수신
thank_message        - 감사 메시지 수신
verification_completed - (신규) 그룹 인증 완료
system               - 시스템 알림
challenge_start      - 챌린지 시작
```

### 변경 파일
- `backend/services/auth/get-notifications/index.ts`

---

## 작업 우선순위

| # | 항목 | 이유 |
|---|------|------|
| 1 | 인증 완료 그룹 알림 | 현재 그룹 챌린지의 핵심 기능 누락 |
| 2 | 알림 페이지네이션 | 실사용 시 데이터 유실 발생 |
| 3 | 전체 읽음 처리 | UX 편의성 |
| 4 | 알림 유형 필터 | UX 편의성, 방법 A면 공수 낮음 |
