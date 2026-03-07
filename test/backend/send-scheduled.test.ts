import { EventBridgeEvent } from 'aws-lambda';

const ddbSendMock = jest.fn();
const snsSendMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}), { virtual: true });

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: ddbSendMock })),
  },
  QueryCommand: class QueryCommand {
    input: any;
    constructor(input: any) { this.input = input; }
  },
  UpdateCommand: class UpdateCommand {
    input: any;
    constructor(input: any) { this.input = input; }
  },
  PutCommand: class PutCommand {
    input: any;
    constructor(input: any) { this.input = input; }
  },
}), { virtual: true });

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({ send: snsSendMock })),
  PublishCommand: class PublishCommand {
    input: any;
    constructor(input: any) { this.input = input; }
  },
}), { virtual: true });

function buildEvent(): EventBridgeEvent<string, any> {
  return {
    id: 'evt-1',
    version: '0',
    account: 'a',
    time: new Date().toISOString(),
    region: 'ap-northeast-2',
    resources: [],
    source: 'test',
    'detail-type': 'scheduled',
    detail: {},
  };
}

describe('send-scheduled handler', () => {
  beforeEach(() => {
    ddbSendMock.mockReset();
    snsSendMock.mockReset();
    process.env.CHEERS_TABLE = 'cheers';
    process.env.CHEER_DEAD_LETTERS_TABLE = 'dlq';
    process.env.SNS_TOPIC_ARN = 'arn:aws:sns:ap-northeast-2:123:test';
    process.env.CHEER_SCHEDULED_MAX_RETRIES = '3';
    process.env.CHEER_SCHEDULED_BACKOFF_MINUTES = '1,5,15';
  });

  it('marks cheer as sent when publish succeeds', async () => {
    const due = new Date(Date.now() - 60_000).toISOString();
    ddbSendMock
      .mockResolvedValueOnce({ Items: [{ cheerId: 'c1', receiverId: 'u1', message: 'm', senderDelta: 10, scheduledTime: due, status: 'pending' }] })
      .mockResolvedValueOnce({});
    snsSendMock.mockResolvedValueOnce({});

    const { handler } = await import('../../backend/services/cheer/send-scheduled/index');
    const res = await handler(buildEvent());

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.sent).toBe(1);
    expect(parsed.deadLettered).toBe(0);

    const updateCall = ddbSendMock.mock.calls[1][0];
    expect(updateCall.input.UpdateExpression).toContain('#status = :sent');
    expect(updateCall.input.ConditionExpression).toBe('#status = :pending');
    expect(updateCall.input.ExpressionAttributeValues[':pending']).toBe('pending');
  });

  it('schedules retry when publish fails and retries remain', async () => {
    const due = new Date(Date.now() - 60_000).toISOString();
    ddbSendMock
      .mockResolvedValueOnce({ Items: [{ cheerId: 'c1', receiverId: 'u1', message: 'm', senderDelta: 10, scheduledTime: due, status: 'pending', retryCount: 0 }] })
      .mockResolvedValueOnce({});
    snsSendMock.mockRejectedValueOnce(new Error('socket timeout'));

    const { handler } = await import('../../backend/services/cheer/send-scheduled/index');
    const res = await handler(buildEvent());

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.retried).toBe(1);

    const retryUpdate = ddbSendMock.mock.calls[1][0];
    expect(retryUpdate.input.UpdateExpression).toContain('retryCount = :retryCount');
    expect(retryUpdate.input.ExpressionAttributeValues[':retryCount']).toBe(1);
    expect(retryUpdate.input.ExpressionAttributeValues[':failureCode']).toBe('TIMEOUT');
  });



  it('skips retry when state already changed by concurrent worker', async () => {
    const due = new Date(Date.now() - 60_000).toISOString();
    ddbSendMock
      .mockResolvedValueOnce({ Items: [{ cheerId: 'c1', receiverId: 'u1', message: 'm', senderDelta: 10, scheduledTime: due, status: 'pending', retryCount: 0 }] })
      .mockRejectedValueOnce(Object.assign(new Error('conditional fail'), { name: 'ConditionalCheckFailedException' }));
    snsSendMock.mockResolvedValueOnce({});

    const { handler } = await import('../../backend/services/cheer/send-scheduled/index');
    const res = await handler(buildEvent());

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.raceSkipped).toBe(1);
    expect(parsed.retried).toBe(0);
    expect(parsed.deadLettered).toBe(0);
    expect(ddbSendMock).toHaveBeenCalledTimes(2);
  });

  it('moves cheer to dead-letter when retry is exhausted', async () => {
    const due = new Date(Date.now() - 60_000).toISOString();
    ddbSendMock
      .mockResolvedValueOnce({ Items: [{ cheerId: 'c1', receiverId: 'u1', message: 'm', senderId: 's1', senderDelta: 10, scheduledTime: due, status: 'pending', retryCount: 3 }] })
      .mockResolvedValueOnce({}) // failed update on cheers table
      .mockResolvedValueOnce({}); // put dead-letter
    snsSendMock.mockRejectedValueOnce(new Error('rate exceeded'));

    const { handler } = await import('../../backend/services/cheer/send-scheduled/index');
    const res = await handler(buildEvent());

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.deadLettered).toBe(1);

    const failedUpdate = ddbSendMock.mock.calls[1][0];
    expect(failedUpdate.input.ExpressionAttributeValues[':failureCode']).toBe('THROTTLED');

    const dlqPut = ddbSendMock.mock.calls[2][0];
    expect(dlqPut.input.TableName).toBe('dlq');
    expect(dlqPut.input.Item.cheerId).toBe('c1');
  });
});
