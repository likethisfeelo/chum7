import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { response, trackKpiEvent } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });

    const result = await client.send(new GetCommand({
      TableName: process.env.CHALLENGE_PREVIEWS_TABLE!,
      Key: { challengeId },
    }));

    const preview = result.Item ?? {
      challengeId,
      blocks: [],
      updatedAt: null,
      updatedBy: null,
    };

    trackKpiEvent('challenge_preview_viewed', { challengeId, at: new Date().toISOString() });

    return response(200, preview);
  } catch (error) {
    console.error('get-preview error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
