import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
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

    let preview = result.Item;

    if (!preview) {
      const challengeResult = await client.send(new GetCommand({
        TableName: process.env.CHALLENGES_TABLE!,
        Key: { challengeId },
      }));

      const challenge = challengeResult.Item ?? {};
      const blocks = [
        { id: 'prefill-type', type: 'text', order: 1, content: `챌린지 유형: ${challenge.challengeType ?? '-'}` },
        { id: 'prefill-schedule', type: 'text', order: 2, content: `일정: ${challenge.challengeStartAt ?? '-'} ~ ${challenge.challengeEndAt ?? '-'}` },
        { id: 'prefill-howto', type: 'text', order: 3, content: `참여 방식: ${challenge.description ?? '챌린지 설명을 입력해 주세요.'}` },
      ];
      const now = new Date().toISOString();
      preview = {
        challengeId,
        blocks,
        updatedAt: now,
        updatedBy: challenge.createdBy ?? 'system-prefill',
      };

      await client.send(new PutCommand({
        TableName: process.env.CHALLENGE_PREVIEWS_TABLE!,
        Item: preview,
        ConditionExpression: 'attribute_not_exists(challengeId)',
      }));
    }

    trackKpiEvent('challenge_preview_viewed', { challengeId, at: new Date().toISOString() });

    return response(200, preview);
  } catch (error) {
    console.error('get-preview error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
