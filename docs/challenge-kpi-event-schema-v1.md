# Challenge KPI Event Schema v1

- version: 1.0.0
- owner: backend + data
- scope: challenge-board KPI events

## 1) Event envelope (EventBridge)

- `source`: `chme.challenge-board.kpi`
- `detail-type`: `ChallengeKpiEvent`
- `detail`: JSON payload (schema below)

## 2) Detail schema

```json
{
  "eventName": "challenge_board_viewed",
  "eventVersion": "1",
  "actorId": "user-123",
  "challengeId": "challenge-456",
  "occurredAt": "2026-03-01T12:34:56.000Z",
  "metadata": {
    "commentId": "optional",
    "blockCount": 3
  }
}
```

### Field definitions

- `eventName` (string, required): KPI event name
- `eventVersion` (string, required): schema version. current fixed value is `1`
- `actorId` (string | null): user id when identifiable
- `challengeId` (string | null): target challenge id
- `occurredAt` (ISO8601 string, required): business event time
- `metadata` (object, required): event-specific attributes

## 3) Versioning policy

- Additive changes in `metadata` are allowed without version bump.
- Any non-backward-compatible change requires `eventVersion` increment.
- During migration, producer must dual-write old/new versions for one release cycle.

## 4) Operational path

1. Producer lambda calls `trackKpiEvent`.
2. EventBridge bus receives event.
3. Rule `KpiEventsToSqsRule` routes to SQS queue.
4. SQS consumer (`kpi-ingest`) writes normalized rows to DynamoDB `kpi-events` table.
5. BI/analytics jobs can read from table or downstream export jobs.

## 5) Monitoring baseline

- DLQ visible messages > 0 → immediate investigation
- Main queue oldest message age >= 300s for 2 periods → backlog alert
- EventBridge rule failed invocations >= 1 → delivery path alert
- Consumer lambda errors >= 1 → ingestion failure alert

## 6) Reprocessing guideline

- If main queue processing fails repeatedly, messages are moved to DLQ.
- Reprocessing should be done by replaying DLQ messages back to main queue after root cause fix.
- Reprocessing action should be recorded in ops log with time window and message count.

## 7) Idempotency policy

- Ingest uses deterministic `eventId`.
- If EventBridge envelope `id` exists, it is used as `eventId`.
- If `id` is absent, `eventId` is derived from a stable hash of source/detail fields.
- Replayed duplicate events overwrite the same item key in DynamoDB (upsert semantics), reducing duplicate analytics rows.

## 8) Admin query path (read/usage)

- Endpoint: `GET /admin/kpi/events`
- Auth: admin roles only
- Query parameters:
  - `eventName` (required)
  - `from` (optional, ISO8601)
  - `to` (optional, ISO8601)
  - `limit` (optional, default 50, max 100)
  - `nextToken` (optional, base64 encoded pagination token)
- Data source: DynamoDB GSI `eventName-occurredAt-index`
