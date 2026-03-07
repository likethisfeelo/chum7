declare module '@aws-sdk/client-dynamodb' {
  export class DynamoDBClient {
    constructor(config?: Record<string, unknown>);
  }
}

declare module '@aws-sdk/lib-dynamodb' {
  export class QueryCommand {
    constructor(input: Record<string, unknown>);
  }

  export class GetCommand {
    constructor(input: Record<string, unknown>);
  }

  export class PutCommand {
    constructor(input: Record<string, unknown>);
  }

  export class UpdateCommand {
    constructor(input: Record<string, unknown>);
  }

  export class BatchGetCommand {
    constructor(input: Record<string, unknown>);
  }

  export const DynamoDBDocumentClient: {
    from(client: unknown): {
      send(command: unknown): Promise<any>;
    };
  };
}
