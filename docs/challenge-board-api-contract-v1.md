# Challenge Feed API Contract v1

- version: 1.0.0
- scope: Challenge Board / Preview / Join-Approval / Refund / Payout

## 1) Challenge Board

### GET `/challenge-board/{challengeId}`
- auth: required, `active` participant only
- 200
```json
{ "challengeId": "c1", "blocks": [], "updatedAt": "...", "updatedBy": "u1" }
```
- 403: `FORBIDDEN`

### POST `/challenge-board/{challengeId}`
- auth: required, leader only
- request
```json
{ "blocks": [{ "id": "b1", "type": "text", "content": "..." }] }
```
- 200
```json
{ "success": true, "updatedAt": "..." }
```

## 2) Challenge Comments

### GET `/challenge-board/{challengeId}/comments`
- auth: required, `active` participant only
- 200: `{ "comments": [...] }`

### POST `/challenge-board/{challengeId}/comments`
- auth: required, `active` participant only
- request: `{ "content": "..." }`
- 200: `{ "commentId": "...", "createdAt": "..." }`

### POST `/challenge-board/{challengeId}/comments/{commentId}/quote`
- auth: required, leader only
- request: `{ "insertAfterBlockId": "b2" }`
- 200: `{ "success": true, "newBlock": { "type": "quote" } }`

## 3) Challenge Preview (non-participant visible)

### GET `/challenge-preview/{challengeId}`
- auth: optional/public
- 200: `{ "challengeId": "c1", "sections": [], "updatedAt": "..." }`

### POST `/challenge-preview/{challengeId}`
- auth: required, leader only
- request: `{ "sections": [...] }`
- 200: `{ "success": true, "updatedAt": "..." }`

## 4) Paid Join / Approval

### GET `/challenges/{challengeId}/join-requests`
- auth: required, leader only
- 200: `{ "items": [...] }`

### POST `/challenges/{challengeId}/join-requests/{userChallengeId}/review`
- auth: required, leader only
- request: `{ "decision": "approve|reject", "reason": "optional" }`
- 200 approve: `{ "success": true, "decision": "approve" }`
- 200 reject: `{ "success": true, "decision": "reject", "refund": { "status": "completed" } }`
- 409: `ALREADY_REVIEWED_OR_INVALID_STATE`

## 5) Refund

### POST `/challenges/{challengeId}/refund`
- auth: required, participant
- 정책: 시작 이후 요청 차단
- 200: `{ "success": true, "refundStatus": "requested" }`
- 409: `REFUND_BLOCKED_AFTER_START`

### POST `/challenges/{challengeId}/refund/{userChallengeId}/review`
- auth: required, admin only
- request: `{ "decision": "approve|reject", "reason": "optional" }`
- 200 approve: `{ "success": true, "decision": "approve", "refundStatus": "completed" }`
- 200 reject: `{ "success": true, "decision": "reject", "refundStatus": "rejected" }`
- 409: `REFUND_REVIEW_CONFLICT`

## 6) Payout

### POST `/challenges/{challengeId}/payout/review`
- auth: required, admin only
- request
```json
{ "decision": "eligible|withheld", "reasonCode": "LEADER_INACTIVE|POLICY_VIOLATION|COMPLAINT_CONFIRMED|OTHER", "reason": "..." }
```
- note: `withheld` 시 `reasonCode` + `reason` 필수

### POST `/challenges/{challengeId}/payout/finalize`
- auth: required, admin only
- 조건
  - challenge lifecycle: `completed|archived`
  - `leaderPayoutStatus`가 `eligible` (또는 미설정)
  - `leaderPayoutAmount > 0`
  - 이미 finalize된 건 재처리 불가
