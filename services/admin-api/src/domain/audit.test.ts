import { auditMonthOf, buildAuditItem, summarizePayload, PAYLOAD_SUMMARY_MAX_LENGTH } from './audit';

describe('domain/audit', () => {
  const now = new Date('2026-07-21T04:05:06.789Z');

  it('월 파티션 + ts#id 정렬 키 + AUDITTARGET gsi1 키를 생성한다', () => {
    const item = buildAuditItem({
      actorUserId: 'admin-1',
      action: 'challenge.update',
      targetType: 'challenge',
      targetId: 'chal-9',
      payload: { title: '새 제목' },
      id: 'audit-id-1',
      now,
    });

    expect(item.pk).toBe('AUDIT#2026-07');
    expect(item.sk).toBe('2026-07-21T04:05:06.789Z#audit-id-1');
    expect(item.gsi1pk).toBe('AUDITTARGET#chal-9');
    expect(item.gsi1sk).toBe('2026-07-21T04:05:06.789Z');
    expect(item.actorUserId).toBe('admin-1');
    expect(item.action).toBe('challenge.update');
    expect(item.target).toEqual({ type: 'challenge', id: 'chal-9' });
    expect(item.payloadSummary).toBe(JSON.stringify({ title: '새 제목' }));
    expect(item.createdAt).toBe('2026-07-21T04:05:06.789Z');
  });

  it('auditMonthOf — ISO ts에서 YYYY-MM을 추출한다', () => {
    expect(auditMonthOf('2026-01-31T23:59:59.000Z')).toBe('2026-01');
  });

  describe('summarizePayload', () => {
    it('undefined/null → null', () => {
      expect(summarizePayload(undefined)).toBeNull();
      expect(summarizePayload(null)).toBeNull();
    });

    it('객체는 JSON 직렬화한다', () => {
      expect(summarizePayload({ a: 1 })).toBe('{"a":1}');
    });

    it('최대 길이를 초과하면 절단하고 말줄임표를 붙인다', () => {
      const long = 'x'.repeat(PAYLOAD_SUMMARY_MAX_LENGTH + 50);
      const summary = summarizePayload(long);
      expect(summary).toHaveLength(PAYLOAD_SUMMARY_MAX_LENGTH + 1);
      expect(summary!.endsWith('…')).toBe(true);
    });

    it('순환 참조 등 직렬화 불가 → null', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(summarizePayload(circular)).toBeNull();
    });
  });
});
