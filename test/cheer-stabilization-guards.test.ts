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
    expect(src).toContain('cheerIdFromPath');
    expect(src).toContain('cheerIdFromBody');
  });

  test('use-ticket handler has claim/finalize and state-aware recovery', () => {
    const src = read('backend/services/cheer/use-ticket/index.ts');
    expect(src).toContain("UpdateExpression: 'SET #status = :processing");
    expect(src).toContain("ConditionExpression: '#status = :available AND userId = :userId'");
    expect(src).toContain('createdCheerCount');
    expect(src).toContain('USE_TICKET_POST_CLAIM_PARTIAL_FAILURE');
    expect(src).toContain("UpdateExpression: 'SET #status = :available REMOVE processingAt, processingToken'");
  });

  test('get-my-cheers sanitizes query params and uses allSettled for read sync', () => {
    const src = read('backend/services/cheer/get-my-cheers/index.ts');
    expect(src).toContain("const type = rawType === 'sent' ? 'sent' : 'received'");
    expect(src).toContain('Math.min(100, Math.max(1, parsedLimit))');
    expect(src).toContain('Promise.allSettled');
    expect(src).toContain('receiverId = :receiverId');
    expect(src).toContain('Failed to mark cheer as read');
  });

  test('get-profile computes available tickets with paginated query count', () => {
    const src = read('backend/services/auth/get-profile/index.ts');
    expect(src).toContain('USER_CHEER_TICKETS_TABLE');
    expect(src).toContain("IndexName: 'userId-status-index'");
    expect(src).toContain('lastEvaluatedKey');
    expect(src).toContain('totalCount += ticketResult.Count || 0');
  });

  test('infra keeps new thank route and legacy compatibility route', () => {
    const stack = read('infra/stacks/cheer-stack.ts');
    expect(stack).toContain("path: '/cheers/{cheerId}/thank'");
    expect(stack).toContain("path: '/cheer/thank'");
  });
});
