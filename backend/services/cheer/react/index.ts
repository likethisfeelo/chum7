import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({});

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_REACTIONS = ['❤️', '🔥', '👏', '🙌', '😊'] as const;
type ReactionType = (typeof ALLOWED_REACTIONS)[number];

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify(body)
  };
}

async function sendReactionNotification(senderId: string, reactionType: ReactionType): Promise<void> {
  try {
    await snsClient.send(new PublishCommand({
      TopicArn: process.env.SNS_TOPIC_ARN!,
      Message: JSON.stringify({
        userId: senderId,
        notification: {
          title: '응원에 리액션이 도착했어요',
          body: `${reactionType} 리액션을 받았어요!`,
          data: {
            type: 'cheer_reacted',
            timestamp: new Date().toISOString(),
            reactionType
          }
        }
      })
    }));
  } catch (error) {
    console.error('Reaction notification error:', error);
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const cheerId = event.pathParameters?.cheerId?.trim();
    if (!cheerId) {
      return response(400, { error: 'MISSING_CHEER_ID', message: '응원 ID가 필요합니다' });
    }

    if (!UUID_V4_REGEX.test(cheerId)) {
      return response(400, { error: 'INVALID_CHEER_ID_FORMAT', message: '응원 ID 형식이 올바르지 않습니다' });
    }

    let reactionType: ReactionType | undefined;
    try {
      const body = JSON.parse(event.body || '{}') as { reactionType?: unknown };
      reactionType = typeof body.reactionType === 'string' && ALLOWED_REACTIONS.includes(body.reactionType as ReactionType)
        ? (body.reactionType as ReactionType)
        : undefined;
    } catch {
      return response(400, { error: 'INVALID_JSON_BODY', message: '요청 본문 JSON 형식이 올바르지 않습니다' });
    }

    if (!reactionType) {
      return response(400, { error: 'INVALID_REACTION_TYPE', message: `reactionType은 ${ALLOWED_REACTIONS.join(', ')} 중 하나여야 합니다` });
    }

    const found = await docClient.send(new GetCommand({
      TableName: process.env.CHEERS_TABLE!,
      Key: { cheerId }
    }));

    const cheer = found.Item as { receiverId?: string; senderId?: string; reactionType?: string } | undefined;
    if (!cheer) {
      return response(404, { error: 'CHEER_NOT_FOUND', message: '응원을 찾을 수 없습니다' });
    }

    if (cheer.receiverId !== userId) {
      return response(403, { error: 'FORBIDDEN', message: '본인이 받은 응원에만 리액션할 수 있습니다' });
    }

    if (cheer.reactionType) {
      return response(409, { error: 'ALREADY_REACTED', message: '이미 리액션을 보냈습니다' });
    }

    const now = new Date().toISOString();

    await docClient.send(new UpdateCommand({
      TableName: process.env.CHEERS_TABLE!,
      Key: { cheerId },
      UpdateExpression: 'SET reactionType = :reactionType, reactedAt = :now',
      ConditionExpression: 'attribute_not_exists(reactionType) AND receiverId = :receiverId',
      ExpressionAttributeValues: {
        ':reactionType': reactionType,
        ':now': now,
        ':receiverId': userId
      }
    }));

    if (cheer.senderId) {
      await sendReactionNotification(cheer.senderId, reactionType);
    }

    return response(200, {
      success: true,
      message: '리액션을 보냈습니다',
      data: {
        cheerId,
        reactionType,
        reactedAt: now
      }
    });
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return response(409, { error: 'ALREADY_REACTED', message: '이미 리액션을 보냈습니다' });
    }

    console.error('React cheer error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
