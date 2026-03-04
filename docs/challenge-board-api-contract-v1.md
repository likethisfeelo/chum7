# Challenge Feed / Board API Contract v1

- version: 1.1.0
- updatedAt: 2026-03-04
- scope: Preview Board / Challenge Feed / Challenge Board / Comments / Leader DM

---

## 공통

- Error format
```json
{ "error": "FORBIDDEN", "message": "participant required", "code": "AUTH_403" }
```
- 권한 기본
  - participant only: 챌린지 피드/보드/댓글 조회/작성
  - creator only: 보드/프리뷰 수정, quote

---

## 1) Preview Board

### GET `/preview-board/{challengeId}`
- auth: optional (public read)
- behavior
  - preview 문서가 없으면 `challenge metadata` 기반 기본 블록을 생성 후 반환 가능(서버 전략)
- 200
```json
{
  "challengeId": "c1",
  "blocks": [
    { "id": "b1", "type": "text", "order": 1, "content": "챌린지 유형: ..." }
  ],
  "updatedAt": "2026-03-04T03:00:00Z",
  "updatedBy": "leader-1"
}
```

### POST `/preview-board/{challengeId}`
- auth: required, creator only
- request
```json
{
  "blocks": [
    { "id": "b1", "type": "text", "order": 1, "content": "소개" },
    { "id": "b2", "type": "image", "order": 2, "url": "https://..." }
  ]
}
```
- 200
```json
{ "success": true, "updatedAt": "2026-03-04T03:00:00Z" }
```

---

## 2) Challenge Board

### GET `/challenge-board/{challengeId}`
- auth: required, active participant only
- 200
```json
{
  "challengeId": "c1",
  "blocks": [],
  "updatedAt": "2026-03-04T03:00:00Z",
  "updatedBy": "leader-1"
}
```
- note: 보드 미생성 시에도 `200 + blocks: []`

### POST `/challenge-board/{challengeId}`
- auth: required, creator only
- request
```json
{
  "blocks": [
    { "id": "b1", "type": "text", "order": 1, "content": "오늘 가이드" }
  ]
}
```
- 200
```json
{ "success": true, "updatedAt": "2026-03-04T03:00:00Z" }
```

---

## 3) Comments

### GET `/challenge-board/{challengeId}/comments`
- auth: required, active participant only
- 200
```json
{
  "comments": [
    {
      "commentId": "cm1",
      "dailyAnonymousId": "고래-274",
      "content": "완료!",
      "isQuoted": false,
      "createdAt": "2026-03-04T03:00:00Z"
    }
  ]
}
```

### POST `/challenge-board/{challengeId}/comments`
- auth: required, active participant only
- request
```json
{ "content": "오늘 인증 완료" }
```
- 200
```json
{
  "commentId": "cm2",
  "dailyAnonymousId": "수달-901",
  "createdAt": "2026-03-04T03:05:00Z"
}
```

### POST `/challenge-board/{challengeId}/comments/{commentId}/quote`
- auth: required, creator only
- request
```json
{ "insertAfterBlockId": "b2" }
```
- 200
```json
{
  "success": true,
  "newBlock": {
    "id": "b9",
    "type": "quote",
    "order": 3,
    "authorName": "고래-274",
    "content": "오늘 인증 완료"
  }
}
```

---

## 4) Challenge Feed: Leader DM

### POST `/challenge-feed/{challengeId}/leader-dm`
- auth: required, active participant only
- behavior
  - 기존 `leaderDmThreadId` 존재 시 재사용
  - 없으면 `(challengeId, participantId, leaderId)` 조합으로 thread upsert
- 200
```json
{
  "threadId": "dm-thread-1",
  "isNew": true,
  "deepLink": "/messages/dm-thread-1"
}
```

---

## 5) Status Codes

- `200 OK`
- `400 INVALID_REQUEST`
- `401 UNAUTHORIZED`
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `409 CONFLICT`
- `500 INTERNAL_ERROR`
