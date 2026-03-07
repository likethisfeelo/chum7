const sendMock = jest.fn();
const queryInputs: Array<Record<string, unknown>> = [];
const updateInputs: Array<Record<string, unknown>> = [];

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class DynamoDBClient {}
}), { virtual: true });

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: () => ({
      send: sendMock
    })
  },
  QueryCommand: class QueryCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
      queryInputs.push(input);
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

function createEvent(overrides: Record<string, unknown> = {}): any {
  return {
    requestContext: {
      authorizer: {
        jwt: {
          claims: { sub: 'user-1' }
        }
      }
    },
    queryStringParameters: undefined,
    ...overrides
  };
}

async function invokeHandler(eventOverrides: Record<string, unknown> = {}) {
  process.env.CHEERS_TABLE = 'cheers-table';
  const { handler } = require('../backend/services/cheer/get-my-cheers/index');
  return handler(createEvent(eventOverrides));
}

describe('get-my-cheers runtime behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryInputs.length = 0;
    updateInputs.length = 0;
  });

  test('normalizes invalid query params and reads from receiver index by default', async () => {
    sendMock.mockResolvedValueOnce({ Items: [] });

    const response = await invokeHandler({
      queryStringParameters: {
        type: '  INVALID  ',
        limit: 'NaN'
      }
    });

    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(queryInputs[0]?.IndexName).toBe('receiverId-index');
    expect(queryInputs[0]?.Limit).toBe(20);
    expect(updateInputs).toHaveLength(0);
    expect(body.data.cheers).toEqual([]);
    expect(body.data.stats.unread).toBe(0);
  });

  test('marks unread cheers as read and treats conditional failures as concurrent success', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [
          { cheerId: 'c1', cheerType: 'immediate', isRead: false, isThanked: false, message: 'A' },
          { cheerId: 'c2', cheerType: 'scheduled', isRead: false, isThanked: true, message: 'B', readAt: null }
        ]
      })
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });

    const response = await invokeHandler();
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(updateInputs).toHaveLength(2);
    expect(body.data.cheers).toHaveLength(2);
    expect(body.data.cheers[0].isRead).toBe(true);
    expect(body.data.cheers[1].isRead).toBe(true);
    expect(body.data.stats.unread).toBe(0);
    expect(body.data.stats.immediate).toBe(1);
    expect(body.data.stats.scheduled).toBe(1);
    expect(body.data.stats.thanked).toBe(1);
  });

  test('keeps unread state when non-conditional update failure happens', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [
          { cheerId: 'c1', cheerType: 'immediate', isRead: false, isThanked: false, message: 'A' }
        ]
      })
      .mockRejectedValueOnce(new Error('network fail'));

    const response = await invokeHandler();
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.data.cheers[0].isRead).toBe(false);
    expect(body.data.cheers[0].readAt).toBeNull();
    expect(body.data.stats.unread).toBe(1);
  });

  test('sent type uses sender index and skips read-marking updates', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        { cheerId: 's1', cheerType: 'immediate', isRead: false, isThanked: false, message: 'S' }
      ]
    });

    const response = await invokeHandler({
      queryStringParameters: {
        type: 'sent',
        limit: '999'
      }
    });

    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(queryInputs[0]?.IndexName).toBe('senderId-index');
    expect(queryInputs[0]?.Limit).toBe(100);
    expect(updateInputs).toHaveLength(0);
    expect(body.data.stats.unread).toBe(1);
  });
});
