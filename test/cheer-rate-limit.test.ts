const sendMock = jest.fn();
const batchGetInputs: Array<Record<string, unknown>> = [];
const updateInputs: Array<Record<string, unknown>> = [];

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  BatchGetCommand: class BatchGetCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
      batchGetInputs.push(input);
    }
  },
  UpdateCommand: class UpdateCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
      updateInputs.push(input);
    }
  }
}), { virtual: true });

const docClient = {
  send: sendMock
} as any;

describe('cheer rate-limit helper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    batchGetInputs.length = 0;
    updateInputs.length = 0;
  });

  test('returns disabled mode when table is not configured', async () => {
    const { acquireRateLimitSlot } = require('../backend/services/cheer/rate-limit');

    const result = await acquireRateLimitSlot({
      action: 'reply',
      userId: 'u1',
      limit: 10,
      windowSeconds: 60,
      docClient,
      tableName: ''
    });

    expect(result.mode).toBe('disabled');
    expect(result.allowed).toBe(false);
    expect(result.strategy).toBe('fixed_window');
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('allows request in sliding window mode when weighted usage is below limit', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:30.000Z'));

    sendMock
      .mockResolvedValueOnce({
        Responses: {
          limits: [
            { rateKey: 'reply#u1#2026-01-01T00:00:00.000Z', requestCount: 3 },
            { rateKey: 'reply#u1#2025-12-31T23:59:00.000Z', requestCount: 4 }
          ]
        }
      })
      .mockResolvedValueOnce({});

    const { acquireRateLimitSlot } = require('../backend/services/cheer/rate-limit');

    const result = await acquireRateLimitSlot({
      action: 'reply',
      userId: 'u1',
      limit: 10,
      windowSeconds: 60,
      docClient,
      tableName: 'limits'
    });

    expect(result.mode).toBe('atomic_table');
    expect(result.strategy).toBe('sliding_window_approx');
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(4);
    expect(result.weightedCurrent).toBeCloseTo(6, 5); // 4 + (4 * 0.5)
    expect(batchGetInputs[0]?.RequestItems).toBeDefined();
    expect(updateInputs).toHaveLength(1);

    jest.useRealTimers();
  });

  test('rejects request when weighted usage exceeds limit', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:10.000Z'));

    sendMock.mockResolvedValueOnce({
      Responses: {
        limits: [
          { rateKey: 'reply#u1#2026-01-01T00:00:00.000Z', requestCount: 6 },
          { rateKey: 'reply#u1#2025-12-31T23:59:00.000Z', requestCount: 8 }
        ]
      }
    });

    const { acquireRateLimitSlot } = require('../backend/services/cheer/rate-limit');

    const result = await acquireRateLimitSlot({
      action: 'reply',
      userId: 'u1',
      limit: 10,
      windowSeconds: 60,
      docClient,
      tableName: 'limits'
    });

    expect(result.allowed).toBe(false);
    expect(result.mode).toBe('atomic_table');
    expect(result.strategy).toBe('sliding_window_approx');
    expect(result.weightedCurrent).toBeGreaterThanOrEqual(10);
    expect(updateInputs).toHaveLength(0);

    jest.useRealTimers();
  });
});


export {};
