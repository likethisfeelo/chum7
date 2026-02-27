import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const updateQuestSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(1000).optional(),
  verificationGuide: z.string().min(1).max(500).optional(),
  rewardPoints: z.number().int().min(0).max(1000).optional(),
  displayOrder: z.number().int().min(0).optional(),
  endAt: z.string().datetime().nullable().optional(),
}).refine((input) => Object.keys(input).length > 0, {
  message: '최소 1개 이상 수정 항목이 필요합니다',
});

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function parseGroups(rawGroups: unknown): string[] {
  if (!rawGroups) return [];
  if (Array.isArray(rawGroups)) return rawGroups.map(String).map(g => g.trim()).filter(Boolean);
  if (typeof rawGroups !== 'string') return [];

  return rawGroups
    .split(/[,:]/)
    .map(g => g.replace(/[\[\]"']/g, '').trim())
    .filter(Boolean);
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!requesterId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const questId = event.pathParameters?.questId;
    if (!questId) {
      return response(400, { error: 'MISSING_QUEST_ID' });
    }

    const body = JSON.parse(event.body || '{}');
    const input = updateQuestSchema.parse(body);

    const existingResult = await docClient.send(new GetCommand({
      TableName: process.env.QUESTS_TABLE!,
      Key: { questId },
    }));

    if (!existingResult.Item) {
      return response(404, { error: 'QUEST_NOT_FOUND', message: '퀘스트를 찾을 수 없습니다' });
    }

    const quest = existingResult.Item;
    const now = new Date().toISOString();

    const groupsRaw = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
    const groups = parseGroups(groupsRaw);
    const canManageByGroup = groups.some(group => ['admins', 'productowners', 'managers'].includes(group));
    const isQuestCreator = quest.createdBy && quest.createdBy === requesterId;

    if (!canManageByGroup && !isQuestCreator) {
      return response(403, { error: 'FORBIDDEN', message: '퀘스트 수정 권한이 없습니다' });
    }

    if (quest.status !== 'active') {
      return response(409, { error: 'QUEST_NOT_EDITABLE', message: 'active 상태의 퀘스트만 수정할 수 있습니다' });
    }

    if (quest.endAt && quest.endAt <= now) {
      return response(409, { error: 'QUEST_ALREADY_ENDED', message: '종료된 퀘스트는 수정할 수 없습니다' });
    }

    const updateExpressionParts: string[] = ['updatedAt = :updatedAt'];
    const expressionAttributeValues: Record<string, any> = { ':updatedAt': now };
    const expressionAttributeNames: Record<string, string> = {};

    if (input.title !== undefined) {
      expressionAttributeNames['#title'] = 'title';
      expressionAttributeValues[':title'] = input.title;
      updateExpressionParts.push('#title = :title');
    }
    if (input.description !== undefined) {
      expressionAttributeNames['#description'] = 'description';
      expressionAttributeValues[':description'] = input.description;
      updateExpressionParts.push('#description = :description');
    }
    if (input.verificationGuide !== undefined) {
      expressionAttributeNames['#verificationGuide'] = 'verificationGuide';
      expressionAttributeValues[':verificationGuide'] = input.verificationGuide;
      updateExpressionParts.push('#verificationGuide = :verificationGuide');
    }
    if (input.rewardPoints !== undefined) {
      expressionAttributeNames['#rewardPoints'] = 'rewardPoints';
      expressionAttributeValues[':rewardPoints'] = input.rewardPoints;
      updateExpressionParts.push('#rewardPoints = :rewardPoints');
    }
    if (input.displayOrder !== undefined) {
      expressionAttributeNames['#displayOrder'] = 'displayOrder';
      expressionAttributeValues[':displayOrder'] = input.displayOrder;
      updateExpressionParts.push('#displayOrder = :displayOrder');
    }
    if (input.endAt !== undefined) {
      expressionAttributeNames['#endAt'] = 'endAt';
      expressionAttributeValues[':endAt'] = input.endAt;
      updateExpressionParts.push('#endAt = :endAt');
    }

    const result = await docClient.send(new UpdateCommand({
      TableName: process.env.QUESTS_TABLE!,
      Key: { questId },
      UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    }));

    return response(200, { success: true, message: '퀘스트가 수정되었습니다', data: result.Attributes });
  } catch (error: any) {
    console.error('Update quest error:', error);
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', details: error.errors });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
