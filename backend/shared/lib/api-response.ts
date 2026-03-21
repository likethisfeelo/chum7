import { APIGatewayProxyResult } from 'aws-lambda';

export function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

export function getUserId(event: { requestContext: { authorizer?: { jwt?: { claims?: { sub?: string } } } } }): string | null {
  return (event.requestContext.authorizer?.jwt?.claims?.sub as string) || null;
}
