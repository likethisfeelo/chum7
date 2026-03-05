// backend/services/cheer/use-ticket/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const useTicketSchema = z.object({
  ticketId: z.string().uuid(),
  message: z.string().trim().min(1).max(200),
});

type UseTicketInput = z.infer<typeof useTicketSchema>;

function response(statusCode: number, body: any): APIGatewayProxyResult {
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

const ANIMAL_ALIASES = ['새벽고래', '숲토끼', '별다람쥐', '파도해달', '노을팬더', '하늘사슴'];
function randomAlias(): string {
  return ANIMAL_ALIASES[Math.floor(Math.random() * ANIMAL_ALIASES.length)];
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  let processingToken: string | null = null;
  let ticketClaimed = false;
  let createdCheerCount = 0;
  let inputTicketId: string | null = null;

  try {
    let body: any = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return response(400, {
        error: 'INVALID_JSON_BODY',
        message: '요청 본문 JSON 형식이 올바르지 않습니다'
      });
    }

    const input: UseTicketInput = useTicketSchema.parse(body);
    inputTicketId = input.ticketId;

    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }


    const ticketResult = await docClient.send(new GetCommand({
      TableName: process.env.USER_CHEER_TICKETS_TABLE!,
      Key: { ticketId: input.ticketId }
    }));

    if (!ticketResult.Item) {
      return response(404, {
        error: 'TICKET_NOT_FOUND',
        message: '응원권을 찾을 수 없습니다'
      });
    }

    const ticket = ticketResult.Item;

    if (ticket.userId !== userId) {
      return response(403, {
        error: 'FORBIDDEN',
        message: '본인의 응원권만 사용할 수 있습니다'
      });
    }

    if (ticket.status !== 'available') {
      return response(409, {
        error: 'TICKET_ALREADY_USED',
        message: '이미 사용된 응원권입니다'
      });
    }

    const now = new Date();
    const nowISO = now.toISOString();
    const expiresAt = new Date(ticket.expiresAt);

    if (Number.isNaN(expiresAt.getTime())) {
      return response(400, {
        error: 'INVALID_TICKET_EXPIRY',
        message: '응원권 만료일 형식이 올바르지 않습니다'
      });
    }

    if (now > expiresAt) {
      return response(410, {
        error: 'TICKET_EXPIRED',
        message: '만료된 응원권입니다'
      });
    }

    const challengeId = typeof ticket.challengeId === 'string' ? ticket.challengeId.trim() : '';
    if (!challengeId) {
      return response(400, {
        error: 'MISSING_CHALLENGE_ID',
        message: '응원권에 challengeId가 없습니다'
      });
    }

    const parsedDelta = Number(ticket.delta);
    if (!Number.isFinite(parsedDelta)) {
      return response(400, {
        error: 'INVALID_TICKET_DELTA',
        message: '응원권 delta 값이 올바르지 않습니다'
      });
    }

    // 1) 응원권 선점(중복 사용 방지)
    // status를 available -> processing으로 먼저 전환해서 동시 요청에서 1건만 통과시킵니다.
    processingToken = uuidv4();
    try {
      await docClient.send(new UpdateCommand({
        TableName: process.env.USER_CHEER_TICKETS_TABLE!,
        Key: { ticketId: input.ticketId },
        UpdateExpression: 'SET #status = :processing, processingAt = :processingAt, processingToken = :processingToken',
        ConditionExpression: '#status = :available AND userId = :userId',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':available': 'available',
          ':processing': 'processing',
          ':processingAt': nowISO,
          ':processingToken': processingToken,
          ':userId': userId
        }
      }));
      ticketClaimed = true;
    } catch (claimError: any) {
      if (claimError?.name === 'ConditionalCheckFailedException') {
        return response(409, {
          error: 'TICKET_NOT_AVAILABLE',
          message: '이미 사용 중이거나 사용된 응원권입니다'
        });
      }

      console.error('Ticket claim update failed:', claimError);
      return response(500, {
        error: 'TICKET_CLAIM_FAILED',
        message: '응원권 선점 중 오류가 발생했습니다'
      });
    }

    const participantsResult = await docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: 'challengeId-index',
      KeyConditionExpression: 'challengeId = :challengeId',
      ExpressionAttributeValues: {
        ':challengeId': challengeId
      }
    }));

    const participants = (participantsResult.Items || []).filter((uc: any) => uc.userId !== userId && uc.status === 'active');

    const targets = participants.filter((member: any) => {
      const progress = member.progress || [];
      const currentDay = member.currentDay || 1;
      const todayProgress = progress.find((p: any) => p.day === currentDay);
      return !todayProgress || todayProgress.status !== 'success';
    });

    if (targets.length === 0) {
      try {
        await docClient.send(new UpdateCommand({
          TableName: process.env.USER_CHEER_TICKETS_TABLE!,
          Key: { ticketId: input.ticketId },
          UpdateExpression: 'SET #status = :available REMOVE processingAt, processingToken',
          ConditionExpression: '#status = :processing AND processingToken = :processingToken',
          ExpressionAttributeNames: {
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':available': 'available',
            ':processing': 'processing',
            ':processingToken': processingToken
          }
        }));
      } catch (releaseError) {
        console.error('Ticket release failed after NO_TARGETS:', releaseError);
        return response(500, {
          error: 'TICKET_RELEASE_FAILED',
          message: '대상 없음 처리 중 응원권 상태 복원에 실패했습니다'
        });
      }

      return response(409, {
        error: 'NO_TARGETS',
        message: '응원 가능한 미완료 참여자가 없습니다'
      });
    }

    const createdCheers: any[] = [];

    for (const target of targets) {
      const cheerId = uuidv4();
      const cheer = {
        cheerId,
        senderId: userId,
        receiverId: target.userId,
        verificationId: null,
        cheerType: 'immediate',
        message: input.message,
        senderDelta: parsedDelta,
        senderAlias: randomAlias(),
        scheduledTime: null,
        status: 'sent',
        isRead: false,
        isThanked: false,
        thankedAt: null,
        createdAt: nowISO,
        sentAt: nowISO
      };

      await docClient.send(new PutCommand({
        TableName: process.env.CHEERS_TABLE!,
        Item: cheer
      }));

      createdCheers.push({ cheerId, receiverId: target.userId });
    }

    createdCheerCount = createdCheers.length;

    await docClient.send(new UpdateCommand({
      TableName: process.env.USER_CHEER_TICKETS_TABLE!,
      Key: { ticketId: input.ticketId },
      UpdateExpression: 'SET #status = :status, usedAt = :usedAt, usedForCheerId = :cheerId, processedAt = :processedAt REMOVE processingAt, processingToken',
      ConditionExpression: '#status = :processing AND processingToken = :processingToken',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'used',
        ':processing': 'processing',
        ':processingToken': processingToken,
        ':usedAt': nowISO,
        ':processedAt': nowISO,
        ':cheerId': createdCheers[0].cheerId
      }
    }));

    return response(200, {
      success: true,
      message: `${createdCheers.length}명에게 익명 응원을 보냈어요!`,
      data: {
        ticketUsed: true,
        challengeId,
        sentCount: createdCheers.length,
        delta: parsedDelta,
        cheers: createdCheers
      }
    });

  } catch (error: any) {
    console.error('Use ticket error:', error);

    if (ticketClaimed && processingToken && inputTicketId) {
      try {
        const nowIso = new Date().toISOString();

        if (createdCheerCount === 0) {
          await docClient.send(new UpdateCommand({
            TableName: process.env.USER_CHEER_TICKETS_TABLE!,
            Key: { ticketId: inputTicketId },
            UpdateExpression: 'SET #status = :available REMOVE processingAt, processingToken',
            ConditionExpression: '#status = :processing AND processingToken = :processingToken',
            ExpressionAttributeNames: {
              '#status': 'status'
            },
            ExpressionAttributeValues: {
              ':available': 'available',
              ':processing': 'processing',
              ':processingToken': processingToken
            }
          }));
        } else {
          await docClient.send(new UpdateCommand({
            TableName: process.env.USER_CHEER_TICKETS_TABLE!,
            Key: { ticketId: inputTicketId },
            UpdateExpression: 'SET #status = :used, usedAt = :usedAt, recoveryRequired = :recoveryRequired, recoveryReason = :recoveryReason, failedAt = :failedAt REMOVE processingAt, processingToken',
            ConditionExpression: '#status = :processing AND processingToken = :processingToken',
            ExpressionAttributeNames: {
              '#status': 'status'
            },
            ExpressionAttributeValues: {
              ':used': 'used',
              ':usedAt': nowIso,
              ':recoveryRequired': true,
              ':recoveryReason': 'USE_TICKET_POST_CLAIM_PARTIAL_FAILURE',
              ':failedAt': nowIso,
              ':processingToken': processingToken
            }
          }));
        }
      } catch (recoveryError) {
        console.error('Use ticket recovery error:', recoveryError);
      }
    }

    if (error instanceof z.ZodError) {
      return response(400, {
        error: 'VALIDATION_ERROR',
        message: '입력값이 올바르지 않습니다',
        details: error.errors
      });
    }

    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
