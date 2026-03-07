import fs from 'fs';
import path from 'path';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('cheer stabilization guards', () => {
  test('thank handler validates malformed json and cheerId mismatch', () => {
    const src = read('backend/services/cheer/thank/index.ts');
    expect(src).toContain('INVALID_JSON_BODY');
    expect(src).toContain('CHEER_ID_MISMATCH');
    expect(src).toContain('const cheerId = pickFirstDefinedString(cheerIdFromPath, cheerIdFromBody);');
    expect(src).toContain("ConditionExpression: '(attribute_not_exists(isThanked) OR isThanked = :false) AND receiverId = :receiverId'");
    expect(src).toContain('ConditionalCheckFailedException');
    expect(src).toContain('receiverId = :receiverId');
    expect(src).toContain('cheerIdFromPath');
    expect(src).toContain('cheerIdFromBody');
    expect(src).toContain('INVALID_CHEER_ID');
    expect(src).toContain('INVALID_CHEER_ID_FORMAT');
    expect(src).toContain('if (cheerIdFromPath && !isUuidV4(cheerIdFromPath)) {');
    expect(src).toContain('if (cheerIdFromBody && !isUuidV4(cheerIdFromBody)) {');
    expect(src).toContain('UUID_V4_REGEX');
    expect(src).toContain('function isUuidV4(value: string): boolean {');
    expect(src).toContain('JSON 객체여야 합니다');
    expect(src).toContain('let body: JsonObject = {};');
    expect(src).toContain('const parsedBody: unknown = JSON.parse(event.body);');
    expect(src).toContain('function isJsonObject(value: unknown): value is JsonObject {');
    expect(src).toContain('if (!isJsonObject(parsedBody)) {');
    expect(src).toContain('cheerIdFromPathRaw');
    expect(src).toContain('const normalizedPathCheerId = normalizeString(cheerIdFromPathRaw);');
    expect(src).toContain('if (cheerIdFromPathRaw !== undefined && !normalizedPathCheerId) {');
    expect(src).toContain('const cheerIdFromPath = normalizedPathCheerId;');
    expect(src).toContain('const normalizedBodyCheerId = normalizeString(cheerIdFromBodyRaw);');
    expect(src).toContain('const hasPathCheerIdValue = hasDefinedValue(normalizedPathCheerId);');
    expect(src).toContain('if (cheerIdFromBodyRaw !== undefined && !normalizedBodyCheerId) {');
    expect(src).toContain('const cheerIdFromBody = normalizedBodyCheerId;');
    expect(src).toContain("const hasBodyCheerIdField = hasOwnKey(body, 'cheerId');");
    expect(src).toContain('cheerIdFromBodyRaw');
    expect(src).toContain('.trim()');
    expect(src).toContain('conditional failure recheck error');
    expect(src).toContain('function normalizeString(value: unknown): string | undefined {');
    expect(src).toContain('function hasErrorName(value: unknown, expectedName: string): boolean {');
    expect(src).toContain('function isConditionalCheckFailed(error: unknown): boolean');
    expect(src).toContain('return hasErrorName(error, CONDITIONAL_CHECK_FAILED_EXCEPTION);');
    expect(src).toContain('if (isConditionalCheckFailed(error)) {');
    expect(src).toContain('} catch (error: unknown) {');
    expect(src).toContain('resolvedCheerId');
    expect(src).toContain('resolvedThankRouteMode');
    expect(src).toContain('CHEER_API_V2_CONTRACT');
    expect(src).toContain('LEGACY_THANK_ROUTE_DISABLED');
    expect(src).toContain('Blocked legacy thank request because CHEER_API_V2_CONTRACT is enabled');
    expect(src).toContain('if (shouldBlockLegacyRoute(CHEER_API_V2_CONTRACT, hasPathCheerIdValue)) {');
    expect(src).toContain('hasPathCheerId: hasPathCheerIdValue');
    expect(src).toContain('hasBodyCheerId: hasBodyCheerIdField');
    expect(src).toContain('const hasBodyCheerIdValue = hasDefinedValue(cheerIdFromBodyRaw);');
    expect(src).toContain('LEGACY_THANK_WARNING_HEADER');
    expect(src).toContain('if (shouldWarnLegacyRoute(CHEER_API_V2_CONTRACT, legacyBodyRouteAttempted)) {');
    expect(src).toContain('legacy thank route is deprecated; migrate to /cheers/{cheerId}/thank');
    expect(src).toContain('hasBodyCheerIdValue');
    expect(src).toContain('Legacy cheer thank contract is deprecated; use /cheers/{cheerId}/thank');
    expect(src).toContain('Deprecation');
    expect(src).toContain('Sunset');
    expect(src).toContain('CHEER_API_V2_SUNSET_AT');
    expect(src).toContain('DEFAULT_CHEER_API_V2_SUNSET_AT');
    expect(src).toContain('resolveCheerApiV2SunsetAt');
    expect(src).toContain('Invalid CHEER_API_V2_SUNSET_AT, fallback to default');
    expect(src).toContain('successor-version');
    expect(src).toContain('buildThankMigrationHeaders');
    expect(src).toContain('THANK_ROUTE_MODE_HEADER');
    expect(src).toContain("const CONDITIONAL_CHECK_FAILED_EXCEPTION = 'ConditionalCheckFailedException';");
    expect(src).toContain("type ThankRouteMode = 'canonical' | 'legacy'");
    expect(src).toContain('function isLegacyBodyRouteAttempt(cheerIdFromPathRaw: unknown, hasBodyCheerIdField: boolean): boolean {');
    expect(src).toContain('function hasOwnKey(target: JsonObject, key: string): boolean {');
    expect(src).toContain('function hasDefinedValue(value: unknown): boolean {');
    expect(src).toContain('function shouldWarnLegacyRoute(contractEnabled: boolean, legacyBodyRouteAttempted: boolean): boolean {');
    expect(src).toContain('function shouldBlockLegacyRoute(contractEnabled: boolean, hasPathCheerIdValue: boolean): boolean {');
    expect(src).toContain('function pickFirstDefinedString(...values: Array<string | undefined>): string | undefined {');
    expect(src).toContain('function resolveThankRouteMode(legacyBodyRouteAttempted: boolean): ThankRouteMode {');
    expect(src).toContain('type JsonObject = Record<string, any>;');
    expect(src).toContain('withThankRouteMode');
    expect(src).toContain('function response(statusCode: number, body: unknown, extraHeaders: Record<string, string> = {}): APIGatewayProxyResult {');
    expect(src).toContain('function canonicalRouteResponse');
    expect(src).toContain("return response(statusCode, body, withThankRouteMode({}, 'canonical'));");
    expect(src).toContain("withThankRouteMode(buildThankMigrationHeaders(), 'legacy')");
    expect(src).toContain('? withThankRouteMode(buildThankMigrationHeaders(), thankRouteMode)');
    expect(src).toContain(': withThankRouteMode({}, thankRouteMode);');
    expect(src).toContain('return blockedLegacyResponse();');
    expect(src).toContain('const legacyBodyRouteAttempted = isLegacyBodyRouteAttempt(cheerIdFromPathRaw, hasBodyCheerIdField);');
    expect(src).toContain('const thankRouteMode = resolveThankRouteMode(legacyBodyRouteAttempted);');
    expect(src).toContain('thankRouteMode,');
    expect(src).toContain('const legacyAwareBadRequest = (body: Record<string, string>) => response(400, body, migrationHeaders);');
    expect(src).toContain('const blockedLegacyResponse = () => response(400, {');
    expect(src).toContain('const requestUserId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;');
    expect(src).toContain('const resolvedRouteModeHeaders = () => withThankRouteMode({}, resolvedThankRouteMode);');
    expect(src).toContain('const resolvedRouteModeResponse = (statusCode: number, body: JsonObject) =>');
    expect(src).toContain('if (latest.Item.receiverId !== requestUserId) {');
    expect(src).toContain('return resolvedRouteModeResponse(500, {');
    expect(src).toContain('LEGACY_THANK_WARNING_HEADER');
  });

  test('use-ticket handler has claim/finalize and state-aware recovery', () => {
    const src = read('backend/services/cheer/use-ticket/index.ts');
    expect(src).toContain("UpdateExpression: 'SET #status = :processing");
    expect(src).toContain("ConditionExpression: '#status = :available AND userId = :userId'");
    expect(src).toContain('createdCheerCount');
    expect(src).toContain('INVALID_TICKET_EXPIRY');
    expect(src).toContain('INVALID_TICKET_DELTA');
    expect(src).toContain('Number.isInteger(parsedDelta)');
    expect(src).toContain('0 이상의 정수여야 합니다');
    expect(src).toContain("const challengeId = typeof ticket.challengeId === 'string' ? ticket.challengeId.trim() : ''");
    expect(src).toContain('message: z.string().trim().min(1).max(200)');
    expect(src).toContain('USE_TICKET_POST_CLAIM_PARTIAL_FAILURE');
    expect(src).toContain("UpdateExpression: 'SET #status = :available REMOVE processingAt, processingToken'");
    expect(src).toContain('ConditionalCheckFailedException');
    expect(src).toContain('TICKET_CLAIM_FAILED');
    expect(src).toContain('TICKET_RELEASE_FAILED');
  });

  test('get-my-cheers sanitizes query params and uses allSettled for read sync', () => {
    const src = read('backend/services/cheer/get-my-cheers/index.ts');
    expect(src).toContain("const rawType = (params.type || 'received').trim().toLowerCase();");
    expect(src).toContain("const type = rawType === 'sent' ? 'sent' : 'received'");
    expect(src).toContain('/^\\d+$/');
    expect(src).toContain('Math.min(100, Math.max(1, parsedLimit))');
    expect(src).toContain('Promise.allSettled');
    expect(src).toContain('receiverId = :receiverId');
    expect(src).toContain('cheer.readAt = readAt');
    expect(src).toContain('readAt: cheer.readAt ?? null');
    expect(src).toContain('Failed to mark cheer as read');
    expect(src).toContain('PromiseRejectedResult');
    expect(src).toContain('ConditionalCheckFailedException');
    expect(src).toContain('Cheer already marked as read by concurrent request');
    expect(src).toContain('cheer.readAt = cheer.readAt ?? readAt');
    expect(src).toContain('reason');
  });

  test('get-profile computes available tickets with paginated query count', () => {
    const src = read('backend/services/auth/get-profile/index.ts');
    expect(src).toContain('USER_CHEER_TICKETS_TABLE');
    expect(src).toContain("IndexName: 'userId-status-index'");
    expect(src).toContain('lastEvaluatedKey');
    expect(src).toContain('const pageCount = Number(ticketResult.Count || 0)');
    expect(src).toContain('totalCount += Number.isFinite(pageCount) ? Math.max(0, Math.floor(pageCount)) : 0');
    expect(src).toContain('fallback to user.cheerTickets');
    expect(src).toContain('Number.isFinite(fallbackCheerTickets)');
    expect(src).toContain('Math.max(0, Math.floor(fallbackCheerTickets))');
  });

  test('infra keeps new thank route and legacy compatibility route', () => {
    const stack = read('infra/stacks/cheer-stack.ts');
    expect(stack).toContain("path: '/cheers/{cheerId}/thank'");
    expect(stack).toContain("path: '/cheer/thank'");
    expect(stack).toContain('CHEER_API_V2_CONTRACT');
    expect(stack).toContain('CHEER_API_V2_SUNSET_AT');
  });

  test('cheer stack wires stats and interaction endpoints', () => {
    const stack = read('infra/stacks/cheer-stack.ts');
    expect(stack).toContain("path: '/cheers/stats'");
    expect(stack).toContain("path: '/cheers/{cheerId}/reply'");
    expect(stack).toContain("path: '/cheers/{cheerId}/reaction'");
    expect(stack).toContain('CheerStatsFn');
    expect(stack).toContain('CheerReplyFn');
    expect(stack).toContain('CheerReactFn');
    expect(stack).toContain('challengesTable.grantReadData(cheerStatsFn)');
    expect(stack).toContain('userChallengesTable.grantReadData(cheerStatsFn)');
    expect(stack).toContain('CHEER_STATS_TABLE');
    expect(stack).toContain('CheerStatsMaterializerFn');
    expect(stack).toContain('CheerStatsMaterializerSchedule');
    expect(stack).toContain('stats-materializer/index.ts');
    expect(stack).toContain('CHEER_STATS_MATERIALIZER_MAX_RETRIES');
    expect(stack).toContain('CHEER_RATE_LIMITS_TABLE');
    expect(stack).toContain('CheerRateLimitsTableRef');
    expect(stack).toContain('CheerRateLimitsTableRefForReact');
    expect(stack).toContain('createErrorAlarm');
    expect(stack).toContain('CheerReplyError');
    expect(stack).toContain('CheerReactError');
    expect(stack).toContain('CheerStatsError');
    expect(stack).toContain('Reply cheer error');
    expect(stack).toContain('React cheer error');
    expect(stack).toContain('Get cheer stats error');
    expect(stack).toContain('CheerOpsDashboard');
    expect(stack).toContain('Dashboard');
    expect(stack).toContain('Cheer Handler Latency p95');
    expect(stack).toContain('Cheer Stats Source Mix (5m)');
    expect(stack).toContain('Materializer Invocations/Errors');
    expect(stack).toContain('CheerStatsBucketedSource');
    expect(stack).toContain('CheerStatsRealtimeFallbackSource');
    expect(stack).toContain("source: 'bucketed'");
    expect(stack).toContain("source: 'realtime_fallback'");
  });

  test('stats handler supports period/day/week/month/challenge filters', () => {
    const src = read('backend/services/cheer/stats/index.ts');
    expect(src).toContain("const period = (params.period || 'all').trim().toLowerCase();");
    expect(src).toContain("if (period === 'challenge' && !challengeId)");
    expect(src).toContain('toIsoRange(period');
    expect(src).toContain("collectByIndex('senderId-index'");
    expect(src).toContain("collectByIndex('receiverId-index'");
    expect(src).toContain('repliedCount');
    expect(src).toContain('reactionCount');
    expect(src).toContain('validateChallengeAccess');
    expect(src).toContain('CHALLENGE_NOT_FOUND');
    expect(src).toContain('CHALLENGE_ACCESS_DENIED');
    expect(src).toContain('TableName: process.env.CHALLENGES_TABLE!');
    expect(src).toContain('TableName: process.env.USER_CHALLENGES_TABLE!');
    expect(src).toContain('Get cheer stats request received');
    expect(src).toContain('Get cheer stats success');
    expect(src).toContain('latencyMs');
    expect(src).toContain('tryLoadBucketedStats');
    expect(src).toContain('CHEER_STATS_TABLE');
    expect(src).toContain("source: 'bucketed'");
    expect(src).toContain("source: 'realtime_fallback'");
    expect(src).toContain('resolveStatsBucketSk');
    expect(src).toContain('source: bucketed.source');
    expect(src).toContain("source: 'realtime_fallback'");
  });

  test('materializer runbook and backfill scripts are documented', () => {
    const runbook = read('docs/cheer-stats-materializer-runbook.md');
    expect(runbook).toContain('fromIso');
    expect(runbook).toContain('toIso');
    expect(runbook).toContain('dryRun');
    expect(runbook).toContain('maxRetries');
    expect(runbook).toContain('scripts/cheer-stats-backfill.sh');
    expect(runbook).toContain('scripts/cheer-stats-backfill.ps1');

    const sh = read('scripts/cheer-stats-backfill.sh');
    expect(sh).toContain('--stage');
    expect(sh).toContain('--dry-run');
    expect(sh).toContain('--from');
    expect(sh).toContain('--to');

    const ps1 = read('scripts/cheer-stats-backfill.ps1');
    expect(ps1).toContain('$Stage');
    expect(ps1).toContain('$DryRun');
    expect(ps1).toContain('$FromIso');
    expect(ps1).toContain('$ToIso');
  });

  test('stats materializer scans cheers and writes bucketed summaries', () => {
    const src = read('backend/services/cheer/stats-materializer/index.ts');
    expect(src).toContain('scanAllCheers');
    expect(src).toContain('buildStatsDocuments');
    expect(src).toContain('batchWriteStats');
    expect(src).toContain('BatchWriteCommand');
    expect(src).toContain('Cheer stats materializer finished');
    expect(src).toContain("challenge#${challengeId}#all");
    expect(src).toContain('owner#');
    expect(src).toContain('writeChunkWithRetry');
    expect(src).toContain('UnprocessedItems');
    expect(src).toContain('maxRetries');
    expect(src).toContain('dryRun');
    expect(src).toContain('fromIso');
    expect(src).toContain('toIso');
    expect(src).toContain('Cheer stats materializer retrying unprocessed items');
  });

  test('shared rate-limit helper supports atomic table window key strategy', () => {
    const src = read('backend/services/cheer/rate-limit.ts');
    expect(src).toContain('acquireRateLimitSlot');
    expect(src).toContain('rateKey');
    expect(src).toContain('computeSlidingUsage');
    expect(src).toContain('sliding_window_approx');
    expect(src).toContain('BatchGetCommand');
    expect(src).toContain('requestCount = :expectedCurrent');
    expect(src).toContain("mode: 'atomic_table'");
    expect(src).toContain("mode: 'disabled'");
  });

  test('reply and react handlers enforce receiver-only interaction and idempotency', () => {
    const replySrc = read('backend/services/cheer/reply/index.ts');
    expect(replySrc).toContain('replyMessage');
    expect(replySrc).toContain('attribute_not_exists(replyMessage) AND receiverId = :receiverId');
    expect(replySrc).toContain('ALREADY_REPLIED');
    expect(replySrc).toContain('checkReplyRateLimit');
    expect(replySrc).toContain('checkReplyRateLimitFallback');
    expect(replySrc).toContain('acquireRateLimitSlot');
    expect(replySrc).toContain('CHEER_RATE_LIMITS_TABLE');
    expect(replySrc).toContain('scan_fallback');
    expect(replySrc).toContain('REPLY_RATE_LIMIT_EXCEEDED');
    expect(replySrc).toContain('Cheer reply request received');
    expect(replySrc).toContain('Cheer reply success');

    const reactSrc = read('backend/services/cheer/react/index.ts');
    expect(reactSrc).toContain('ALLOWED_REACTIONS');
    expect(reactSrc).toContain('attribute_not_exists(reactionType) AND receiverId = :receiverId');
    expect(reactSrc).toContain('ALREADY_REACTED');
    expect(reactSrc).toContain('checkReactionRateLimit');
    expect(reactSrc).toContain('checkReactionRateLimitFallback');
    expect(reactSrc).toContain('acquireRateLimitSlot');
    expect(reactSrc).toContain('CHEER_RATE_LIMITS_TABLE');
    expect(reactSrc).toContain('scan_fallback');
    expect(reactSrc).toContain('REACTION_RATE_LIMIT_EXCEEDED');
    expect(reactSrc).toContain('Cheer reaction request received');
    expect(reactSrc).toContain('Cheer reaction success');
  });

});
