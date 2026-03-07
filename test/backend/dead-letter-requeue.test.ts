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
    constructor(input: any) { this.input = input; }
  },
  UpdateCommand: class UpdateCommand {
    input: any;
    constructor(input: any) { this.input = input; }
  },
}), { virtual: true });

function buildEvent(): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/admin/cheer/dead-letters/c1/requeue',
    pathParameters: { cheerId: 'c1' },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      accountId: '', apiId: '', protocol: '', httpMethod: 'POST', identity: {} as any,
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

describe('dead-letter requeue handler', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.CHEER_DEAD_LETTERS_TABLE = 'deadletters';
    process.env.CHEERS_TABLE = 'cheers';
  });

  it('requeues a dead-letter item', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: { cheerId: 'c1', status: 'dead' } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/requeue/index');
    const res = await handler(buildEvent());

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data.cheerId).toBe('c1');
  });

  it('returns 404 when dead-letter is missing', async () => {
    sendMock.mockResolvedValueOnce({ Item: null });

    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/requeue/index');
    const res = await handler(buildEvent());

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('DEAD_LETTER_NOT_FOUND');
  });
});
