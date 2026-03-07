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
}), { virtual: true });

function buildEvent(overrides?: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'DELETE',
    isBase64Encoded: false,
    path: '/cheer/scheduled/c1',
    pathParameters: { cheerId: 'c1' },
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
            sub: 'u1',
          },
          scopes: [],
        },
      } as any,
      protocol: '',
      httpMethod: 'DELETE',
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

describe('cancel-scheduled handler', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.CHEERS_TABLE = 'cheers';
    process.env.CHEER_SCHEDULED_CANCELLATION_CUTOFF_MINUTES = '5';
  });

  it('cancels pending scheduled cheer before cutoff', async () => {
    const future = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    sendMock
      .mockResolvedValueOnce({ Item: { cheerId: 'c1', senderId: 'u1', cheerType: 'scheduled', status: 'pending', scheduledTime: future } })
      .mockResolvedValueOnce({});

    const { handler } = await import('../../backend/services/cheer/cancel-scheduled/index');
    const res = await handler(buildEvent());

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data.cheerId).toBe('c1');
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('returns CANCELLATION_WINDOW_CLOSED inside cutoff', async () => {
    const future = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    sendMock.mockResolvedValueOnce({ Item: { cheerId: 'c1', senderId: 'u1', cheerType: 'scheduled', status: 'pending', scheduledTime: future } });

    const { handler } = await import('../../backend/services/cheer/cancel-scheduled/index');
    const res = await handler(buildEvent());

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toBe('CANCELLATION_WINDOW_CLOSED');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
