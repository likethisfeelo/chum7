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
    path: '/cheer/scheduled',
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
          claims: { sub: 'u1' },
          scopes: [],
        },
      } as any,
    },
  } as APIGatewayProxyEvent;
}

describe('get-scheduled handler', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.CHEERS_TABLE = 'cheers';
  });

  it('returns paged scheduled list with nextToken', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ cheerId: 'c1', receiverId: 'r1', message: 'm1', senderDelta: 3, scheduledTime: new Date(Date.now() + 60_000).toISOString(), status: 'pending' }],
      LastEvaluatedKey: { senderId: 'u1', createdAt: '2026-01-01T00:00:00.000Z' }
    });

    const { handler } = await import('../../backend/services/cheer/get-scheduled/index');
    const res = await handler(buildEvent({ limit: '10' }));

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.data.total).toBe(1);
    expect(parsed.data.nextToken).toBeTruthy();

    const queryCmd = sendMock.mock.calls[0][0];
    expect(queryCmd.input.Limit).toBe(10);
    expect(queryCmd.input.FilterExpression).toContain('#status = :pending');
  });

  it('returns INVALID_NEXT_TOKEN when token is malformed', async () => {
    const { handler } = await import('../../backend/services/cheer/get-scheduled/index');
    const res = await handler(buildEvent({ nextToken: 'not-base64' }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('INVALID_NEXT_TOKEN');
    expect(sendMock).toHaveBeenCalledTimes(0);
  });
});
