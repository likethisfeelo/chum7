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

function buildEvent(opts?: { query?: Record<string, string>; groups?: string }): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/admin/cheer/dead-letters',
    pathParameters: null,
    queryStringParameters: opts?.query || null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      accountId: '', apiId: '', protocol: '', httpMethod: 'GET', identity: {} as any,
      path: '', stage: '', requestId: '', requestTimeEpoch: 0, resourceId: '', resourcePath: '',
      authorizer: {
        jwt: {
          claims: { sub: 'ops1', 'cognito:groups': opts?.groups ?? 'admins' },
          scopes: [],
        },
      } as any,
    },
  } as APIGatewayProxyEvent;
}

describe('dead-letter list handler', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.CHEER_DEAD_LETTERS_TABLE = 'deadletters';
  });

  it('returns dead-letter list with nextToken', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ cheerId: 'c1', status: 'dead' }],
      Count: 1,
      LastEvaluatedKey: { cheerId: 'c1', status: 'dead', failedAt: '2026-01-01T00:00:00.000Z' },
    });

    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/list/index');
    const res = await handler(buildEvent());

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.data.count).toBe(1);
    expect(parsed.data.deadLetters[0].cheerId).toBe('c1');
    expect(parsed.data.nextToken).toBeTruthy();

    const command = sendMock.mock.calls[0][0];
    expect(command.input.KeyConditionExpression).toContain('#status = :status');
    expect(command.input.ExpressionAttributeValues[':status']).toBe('dead');
  });

  it('applies failureCode filter when provided', async () => {
    sendMock.mockResolvedValueOnce({ Items: [], Count: 0 });

    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/list/index');
    const res = await handler(buildEvent({ query: { failureCode: 'TIMEOUT' } }));

    expect(res.statusCode).toBe(200);
    const command = sendMock.mock.calls[0][0];
    expect(command.input.FilterExpression).toBe('failureCode = :failureCode');
    expect(command.input.ExpressionAttributeValues[':failureCode']).toBe('TIMEOUT');
  });

  it('returns INVALID_NEXT_TOKEN for malformed nextToken', async () => {
    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/list/index');
    const res = await handler(buildEvent({ query: { nextToken: 'not-base64!!' } }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('INVALID_NEXT_TOKEN');
    expect(sendMock).toHaveBeenCalledTimes(0);
  });

  it('returns FORBIDDEN for non-ops role', async () => {
    const { handler } = await import('../../backend/services/admin/cheer/dead-letter/list/index');
    const res = await handler(buildEvent({ groups: 'participants' }));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe('FORBIDDEN');
  });
});
