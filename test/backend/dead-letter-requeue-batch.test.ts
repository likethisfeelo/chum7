import { APIGatewayProxyEvent } from 'aws-lambda';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}), { virtual: true });

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: sendMock })),
  },
  GetCommand: class GetCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  },
  UpdateCommand: class UpdateCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  },
  TransactWriteCommand: class TransactWriteCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  },
}), { virtual: true });

function buildEvent(body: any): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/admin/cheer/dead-letters/requeue-batch',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      accountId: '',
      apiId: '',
      authorizer: {
        jwt: {
          claims: {
            sub: 'ops-1',
            'cognito:groups': 'admins',
          },
          scopes: [],
        },
      } as any,
      protocol: '',
      httpMethod: 'POST',
      identity: {} as any,
      path: '',
      stage: '',
      requestId: '',
      requestTimeEpoch: 0,
      resourceId: '',
      resourcePath: '',
    },
  } as APIGatewayProxyEvent;
}

describe('dead-letter batch requeue handler', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.CHEERS_TABLE = 'cheers';
    process.env.CHEER_DEAD_LETTERS_TABLE = 'deadletters';
  });

  it('rejects over batch limit', async () => {
    const ids = Array.from({ length: 51 }, (_, idx) => `c-${idx}`);
    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/requeue-batch/index');
    const res = await handler(buildEvent({ cheerIds: ids }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('BATCH_LIMIT_EXCEEDED');
  });

  it('returns mixed success/failure results', async () => {
    // c1: get(dead) + transactional requeue success
    // c2: get(not found)
    sendMock
      .mockResolvedValueOnce({ Item: { cheerId: 'c1', status: 'dead' } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: null });

    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/requeue-batch/index');
    const res = await handler(buildEvent({ cheerIds: ['c1', 'c2'] }));

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.data.successCount).toBe(1);
    expect(parsed.data.failCount).toBe(1);
    expect(parsed.data.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cheerId: 'c1', ok: true }),
        expect.objectContaining({ cheerId: 'c2', ok: false, error: 'DEAD_LETTER_NOT_FOUND' }),
      ]),
    );
  });
});
