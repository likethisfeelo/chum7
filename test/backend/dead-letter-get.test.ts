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
}), { virtual: true });

function buildEvent(): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/admin/cheer/dead-letters/c1',
    pathParameters: { cheerId: 'c1' },
    queryStringParameters: null,
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

describe('dead-letter get handler', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.CHEER_DEAD_LETTERS_TABLE = 'deadletters';
    process.env.CHEERS_TABLE = 'cheers';
  });

  it('returns dead-letter detail with cheer snapshot', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: { cheerId: 'c1', status: 'dead', failureCode: 'TIMEOUT' } })
      .mockResolvedValueOnce({ Item: { cheerId: 'c1', status: 'failed' } });

    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/get/index');
    const res = await handler(buildEvent());

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.data.deadLetter.cheerId).toBe('c1');
    expect(parsed.data.cheerSnapshot.status).toBe('failed');
  });
});
