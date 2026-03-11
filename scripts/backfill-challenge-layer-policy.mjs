#!/usr/bin/env node
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.CHALLENGES_TABLE;

if (!TABLE_NAME) {
  console.error('[backfill] CHALLENGES_TABLE environment variable is required');
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');
const pageSizeArg = [...args].find((v) => v.startsWith('--page-size='));
const pageSize = pageSizeArg ? Number(pageSizeArg.split('=')[1]) : 100;

if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
  console.error('[backfill] --page-size must be an integer between 1 and 1000');
  process.exit(1);
}

const dynamo = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamo);

const FORCE_TYPES = new Set(['personal_only', 'leader_personal']);

const normalizeLayerPolicy = (challengeType, rawLayerPolicy) => {
  const layerPolicy = rawLayerPolicy || {};
  const forceRequireGoal = FORCE_TYPES.has(String(challengeType || 'leader_personal'));

  return {
    requirePersonalGoalOnJoin: forceRequireGoal ? true : Boolean(layerPolicy.requirePersonalGoalOnJoin),
    requirePersonalTargetOnJoin: layerPolicy.requirePersonalTargetOnJoin ?? true,
    allowExtraVisibilityToggle: layerPolicy.allowExtraVisibilityToggle ?? true,
  };
};

const needsUpdate = (challenge) => {
  const normalized = normalizeLayerPolicy(challenge.challengeType, challenge.layerPolicy);
  return {
    normalized,
    changed:
      challenge.layerPolicy?.requirePersonalGoalOnJoin !== normalized.requirePersonalGoalOnJoin ||
      challenge.layerPolicy?.requirePersonalTargetOnJoin !== normalized.requirePersonalTargetOnJoin ||
      challenge.layerPolicy?.allowExtraVisibilityToggle !== normalized.allowExtraVisibilityToggle,
  };
};

const run = async () => {
  console.log(`[backfill] start table=${TABLE_NAME} mode=${shouldApply ? 'apply' : 'dry-run'} pageSize=${pageSize}`);

  let scanned = 0;
  let matched = 0;
  let changed = 0;
  let updated = 0;
  let lastEvaluatedKey;

  do {
    const res = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: 'challengeId, challengeType, layerPolicy',
        ExclusiveStartKey: lastEvaluatedKey,
        Limit: pageSize,
      }),
    );

    const items = res.Items || [];
    scanned += items.length;

    for (const challenge of items) {
      if (!FORCE_TYPES.has(String(challenge.challengeType || 'leader_personal'))) {
        continue;
      }

      matched += 1;
      const { normalized, changed: isChanged } = needsUpdate(challenge);
      if (!isChanged) continue;

      changed += 1;
      if (!shouldApply) continue;

      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { challengeId: challenge.challengeId },
          UpdateExpression: 'SET layerPolicy = :layerPolicy, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':layerPolicy': normalized,
            ':updatedAt': new Date().toISOString(),
          },
        }),
      );
      updated += 1;
    }

    lastEvaluatedKey = res.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`[backfill] done scanned=${scanned} matched=${matched} changed=${changed} updated=${updated}`);
  if (!shouldApply) {
    console.log('[backfill] dry-run only. Re-run with --apply to persist updates.');
  }
};

run().catch((error) => {
  console.error('[backfill] failed:', error);
  process.exit(1);
});
