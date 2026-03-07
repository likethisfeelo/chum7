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
  TransactWriteCommand: class TransactWriteCommand {
    input: any;
    constructor(input: any) { this.input = input; }
  },
}), { virtual: true });

function buildEvent(body: any, groups = 'admins'): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/admin/cheer/dead-letters/requeue-by-query',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      accountId: '', apiId: '', protocol: '', httpMethod: 'POST', identity: {} as any,
      path: '', stage: '', requestId: '', requestTimeEpoch: 0, resourceId: '', resourcePath: '',
      authorizer: {
        jwt: {
          claims: { sub: 'ops1', 'cognito:groups': groups },
          scopes: [],
        },
      } as any,
    },
  } as APIGatewayProxyEvent;
}

describe('dead-letter requeue-by-query handler', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.CHEERS_TABLE = 'cheers';
    process.env.CHEER_DEAD_LETTERS_TABLE = 'deadletters';
  });

  it('supports dryRun with candidate ids', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        { cheerId: 'c1', status: 'dead' },
        { cheerId: 'c2', status: 'dead' },
      ],
    });

    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/requeue-by-query/index');
    const res = await handler(buildEvent({ dryRun: true, limit: 10 }));

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.data.dryRun).toBe(true);
    expect(parsed.data.matchedCount).toBe(2);
    expect(parsed.data.candidateCheerIds).toEqual(['c1', 'c2']);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('requeues matched items when dryRun is false', async () => {
    sendMock
      .mockResolvedValueOnce({ Items: [{ cheerId: 'c1', status: 'dead' }] })
      .mockResolvedValueOnce({});

    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/requeue-by-query/index');
    const res = await handler(buildEvent({ dryRun: false, limit: 10, failureCode: 'TIMEOUT' }));

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.data.total).toBe(1);
    expect(parsed.data.successCount).toBe(1);

    const queryCmd = sendMock.mock.calls[0][0];
    expect(queryCmd.input.FilterExpression).toBe('failureCode = :failureCode');
    const txCmd = sendMock.mock.calls[1][0];
    expect(txCmd.input.TransactItems).toHaveLength(2);
  });

  it('returns forbidden for non-ops role', async () => {
    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/requeue-by-query/index');
    const res = await handler(buildEvent({ dryRun: true }, 'participants'));
    expect(res.statusCode).toBe(403);
  });
});
