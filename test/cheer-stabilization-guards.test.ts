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
    expect(src).toContain("ConditionExpression: '(attribute_not_exists(isThanked) OR isThanked = :false) AND receiverId = :receiverId'");
    expect(src).toContain('ConditionalCheckFailedException');
    expect(src).toContain('receiverId = :receiverId');
    expect(src).toContain('cheerIdFromPath');
    expect(src).toContain('cheerIdFromBody');
    expect(src).toContain('INVALID_CHEER_ID');
    expect(src).toContain('INVALID_CHEER_ID_FORMAT');
    expect(src).toContain('UUID_V4_REGEX');
    expect(src).toContain('JSON 객체여야 합니다');
    expect(src).toContain('cheerIdFromPathRaw');
    expect(src).toContain('hasBodyCheerIdField');
    expect(src).toContain('cheerIdFromBodyRaw');
    expect(src).toContain('.trim()');
    expect(src).toContain('conditional failure recheck error');
    expect(src).toContain('resolvedCheerId');
    expect(src).toContain('CHEER_API_V2_CONTRACT');
    expect(src).toContain('LEGACY_THANK_ROUTE_DISABLED');
    expect(src).toContain('Blocked legacy thank request because CHEER_API_V2_CONTRACT is enabled');
    expect(src).toContain('hasBodyCheerId: !!cheerIdFromBody');
    expect(src).toContain('LEGACY_THANK_WARNING_HEADER');
    expect(src).toContain('legacy thank route is deprecated; migrate to /cheers/{cheerId}/thank');
    expect(src).toContain('Legacy cheer thank contract is deprecated; use /cheers/{cheerId}/thank');
    expect(src).toContain('Deprecation');
    expect(src).toContain('Sunset');
    expect(src).toContain('CHEER_API_V2_SUNSET_AT');
    expect(src).toContain('DEFAULT_CHEER_API_V2_SUNSET_AT');
    expect(src).toContain('resolveCheerApiV2SunsetAt');
    expect(src).toContain('Invalid CHEER_API_V2_SUNSET_AT, fallback to default');
    expect(src).toContain('successor-version');
    expect(src).toContain('buildThankMigrationHeaders');
    expect(src).toContain('}, buildThankMigrationHeaders());');
    expect(src).toContain('const legacyBodyRouteAttempted = cheerIdFromPathRaw === undefined && hasBodyCheerIdField;');
    expect(src).toContain('const migrationHeaders = legacyBodyRouteAttempted ? buildThankMigrationHeaders() : {};');
    expect(src).toContain('const legacyAwareBadRequest = (body: Record<string, string>) => response(400, body, migrationHeaders);');
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
});
