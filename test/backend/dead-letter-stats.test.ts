import { APIGatewayProxyEvent } from 'aws-lambda';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}), { virtual: true });

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: sendMock })),
  },
  QueryCommand: class QueryCommand {
    input: any;
    constructor(input: any) { this.input = input; }
  },
}), { virtual: true });

function buildEvent(query?: Record<string, string>): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/admin/cheer/dead-letters/stats',
    pathParameters: null,
    queryStringParameters: query || null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      accountId: '', apiId: '', protocol: '', httpMethod: 'GET', identity: {} as any,
      path: '', stage: '', requestId: '', requestTimeEpoch: 0, resourceId: '', resourcePath: '',
      authorizer: {
        jwt: {
          claims: { sub: 'ops1', 'cognito:groups': 'admins' },
          scopes: [],
        },
      } as any,
    },
  } as APIGatewayProxyEvent;
}

describe('dead-letter stats handler', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.CHEER_DEAD_LETTERS_TABLE = 'deadletters';
  });

  it('returns aggregated dead/requeued counts', async () => {
    // dead count + requeued count
    sendMock
      .mockResolvedValueOnce({ Count: 7 })
      .mockResolvedValueOnce({ Count: 3 });

    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/stats/index');
    const res = await handler(buildEvent());

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.data.deadCount).toBe(7);
    expect(parsed.data.requeuedCount).toBe(3);
    expect(parsed.data.unresolvedCount).toBe(4);
  });

  it('returns INVALID_ISO_RANGE for malformed iso input', async () => {
    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/stats/index');
    const res = await handler(buildEvent({ fromIso: 'not-iso' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('INVALID_ISO_RANGE');
  });
});
