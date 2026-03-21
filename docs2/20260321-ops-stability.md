# 운영 안정화 항목 상세 설명

운영 중 당장 장애는 없지만, 사용자 증가 시 성능·비용·운영 품질에 직접 영향을 주는 항목들입니다.

---

## 1. 광장 피드 Scan → GSI Query 전환

### 현재 상태
- 광장 피드 조회 시 DynamoDB `PLAZA_POSTS_TABLE` 전체 Scan
- Scan: 테이블 전체를 순회 → 데이터 증가 시 읽기 비용 선형 증가
- 100만 개 게시글 기준: Scan 비용 ≈ Query 비용의 수백~수천 배

### 문제 시나리오
```
게시글 10,000개 → Scan 비용: ~10,000 RCU/요청
게시글 100,000개 → Scan 비용: ~100,000 RCU/요청
```

### 권장 해결안

**방법 A: 파티션 키로 분류하는 GSI 추가**
```
GSI: feedType-createdAt-index
  Partition Key: feedType (예: 'public', 'challenge')
  Sort Key: createdAt
```
→ 특정 피드 타입의 최근 게시글 Query로 빠르게 조회

**방법 B: 날짜 기반 샤딩**
```
GSI: datePartition-createdAt-index
  Partition Key: datePartition (예: '2026-03', '2026-04' 형식)
  Sort Key: createdAt
```
→ 월별로 나누어 Query

**권장: 방법 A** — 피드 타입별 최신순 정렬이 자연스러운 UX와 일치

### 작업 항목
- [ ] `infra/stacks/dynamodb-stack.ts`: `PLAZA_POSTS_TABLE`에 GSI 추가
- [ ] 게시글 생성 시 `feedType` 필드 추가 (`backend/services/plaza/create-post/index.ts`)
- [ ] 피드 조회 핸들러를 Scan → Query로 교체
- [ ] 기존 데이터 마이그레이션 스크립트 작성 (feedType 필드 backfill)

### 주의사항
- 기존 게시글에 `feedType` 없으면 GSI에 인덱싱 안 됨 → 마이그레이션 필수
- GSI 추가 후 기존 Scan 코드와 병행 운영 기간 필요

---

## 2. KPI 이벤트 EventBridge 연결

### 현재 상태
- 주요 사용자 행동이 DynamoDB에만 기록, EventBridge에 발행되지 않음
- 분석, 마케팅 자동화, 외부 서비스 연동 불가

### 목표 이벤트 목록

| 이벤트 | 발생 위치 | 용도 |
|--------|---------|------|
| `verification.completed` | `verification/submit` | DAU 측정, 연속 인증 분석 |
| `verification.remedy_completed` | `verification/remedy` | 보완 사용률 분석 |
| `challenge.joined` | `challenge/join` | 참가자 증가 추적 |
| `challenge.completed` | `verification/submit` (마지막 날) | 완주율 측정 |
| `cheer.sent` | `cheer/send-scheduled` | 응원 활성도 분석 |
| `user.registered` | `auth/signup` | 신규 가입 추적 |

### 이벤트 스키마 예시
```json
{
  "Source": "chme.app",
  "DetailType": "verification.completed",
  "Detail": {
    "userId": "uuid",
    "challengeId": "uuid",
    "day": 3,
    "delta": -15,
    "score": 10,
    "timestamp": "2026-03-21T09:00:00Z"
  }
}
```

### 권장 해결안

**방법 A: 각 Lambda에서 직접 EventBridge Put**
```typescript
// 기존 Lambda에 추가
await eventBridgeClient.send(new PutEventsCommand({
  Entries: [{
    Source: 'chme.app',
    DetailType: 'verification.completed',
    Detail: JSON.stringify(eventDetail),
    EventBusName: process.env.EVENT_BUS_NAME
  }]
}));
```

**방법 B: DynamoDB Streams + Lambda fan-out**
- DynamoDB Streams 활성화 → 변경 이벤트 Lambda로 전달 → EventBridge 발행
- Lambda 코드 변경 없음, 기존 데이터도 capture

**권장: 방법 A** — 의도적인 KPI 이벤트만 발행, 노이즈 없음

### 작업 항목
- [ ] `infra/stacks/core-stack.ts`: EventBridge Custom Bus 생성
- [ ] 각 Lambda에 `EventBridgeClient` 추가 및 이벤트 발행 코드 삽입
- [ ] `infra/stacks/` 각 스택: Lambda에 `events:PutEvents` 권한 추가
- [ ] 필요 시 EventBridge Rule → SQS/SNS/Lambda 연결 (분석 파이프라인)

---

## 3. 챌린지 키워드 검색

### 현재 상태
- `GET /challenges?category=health` 등 카테고리 필터만 존재
- 제목/설명 키워드 검색 없음

### 권장 해결안 비교

**방법 A: DynamoDB FilterExpression (빠른 구현)**
```typescript
// 조회 후 contains 조건으로 필터
FilterExpression: 'contains(title, :keyword) OR contains(description, :keyword)',
ExpressionAttributeValues: { ':keyword': keyword }
```
- 장점: 인프라 추가 없음, 빠른 구현
- 단점: 전체 Scan 발생, 한글 형태소 분석 없음, 초성 검색 불가

**방법 B: OpenSearch Service 연동 (풀텍스트 검색)**
- DynamoDB Streams → Lambda → OpenSearch 동기화
- 한글 형태소 분석기(nori) 지원, 초성 검색 가능
- 단점: 인프라 비용 증가(월 $30~), 구성 복잡도 높음

**방법 C: 챌린지 목록 캐싱 + 클라이언트 검색**
- 전체 챌린지 수가 수백 건 이하라면 전체 조회 후 클라이언트에서 필터
- 단점: 챌린지 수 증가 시 네트워크 비용

**권장: 방법 A로 시작 → 필요 시 B로 전환**
- 챌린지 수가 적은 초기에는 방법 A로 충분
- 챌린지 1,000개 이상이거나 한글 검색 품질 요구 시 OpenSearch 도입

### 작업 항목 (방법 A 기준)
- [ ] `backend/services/challenge/list/index.ts` (또는 신규 search 핸들러)에 `keyword` 파라미터 추가
- [ ] FilterExpression으로 `title`, `description` contains 검색
- [ ] `infra/stacks/challenge-stack.ts` 라우트 추가 (기존 list 핸들러 수정이면 불필요)

---

## 작업 우선순위 (운영 안정화)

| # | 항목 | 트리거 조건 | 예상 공수 |
|---|------|-----------|---------|
| 1 | 광장 피드 GSI 전환 | 게시글 1,000개 초과 또는 응답 지연 발생 시 | 중 (마이그레이션 포함) |
| 2 | KPI EventBridge 연결 | 사용자 행동 분석 필요 시 | 중 |
| 3 | 챌린지 키워드 검색 | 챌린지 20개 이상 등록 시 | 소 (방법 A) |

> 지금 당장은 LOW 우선순위이나, 사용자 증가 시 1번(피드 Scan)이 빠르게 HIGH로 격상됩니다.
