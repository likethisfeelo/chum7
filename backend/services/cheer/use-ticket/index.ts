// backend/services/cheer/use-ticket/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const eventBridgeClient = new EventBridgeClient({});

// 입력 검증 스키마
const useTicketSchema = z.object({
  ticketId: z.string().uuid(),
  receiverId: z.string().uuid(),
  message: z.string().min(1).max(200),
  receiverTargetTime: z.string().datetime()
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

// 예약 발송 시간 계산
function calculateScheduledTime(
  receiverTargetTime: string,
  senderDelta: number
): string {
  const targetDate = new Date(receiverTargetTime);
  // 수신자 목표 시간에서 발신자 델타(분)를 뺌
  targetDate.setMinutes(targetDate.getMinutes() - senderDelta);
  return targetDate.toISOString();
}

// EventBridge 스케줄 등록
async function scheduleCheerDelivery(
  cheerId: string,
  scheduledTime: string
): Promise<void> {
  await eventBridgeClient.send(new PutEventsCommand({
    Entries: [
      {
        Source: 'chme.cheer',
        DetailType: 'ScheduledCheerDelivery',
        Detail: JSON.stringify({
          cheerId,
          scheduledTime
        }),
        EventBusName: process.env.EVENT_BUS_NAME!,
        Time: new Date(scheduledTime)
      }
    ]
  }));
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // 1. 입력 검증
    const body = JSON.parse(event.body || '{}');
    const input: UseTicketInput = useTicketSchema.parse(body);

    // 2. 사용자 인증 (Cognito JWT Authorizer에서 주입)
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    // 3. 응원권 조회
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

    // 4. 권한 확인
    if (ticket.userId !== userId) {
      return response(403, {
        error: 'FORBIDDEN',
        message: '본인의 응원권만 사용할 수 있습니다'
      });
    }

    // 5. 상태 확인
    if (ticket.status !== 'available') {
      return response(409, {
        error: 'TICKET_ALREADY_USED',
        message: '이미 사용된 응원권입니다'
      });
    }

    // 6. 만료 확인
    const now = new Date();
    const expiresAt = new Date(ticket.expiresAt);
    if (now > expiresAt) {
      return response(410, {
        error: 'TICKET_EXPIRED',
        message: '만료된 응원권입니다'
      });
    }

    // 7. 예약 발송 시간 계산
    const scheduledTime = calculateScheduledTime(
      input.receiverTargetTime,
      ticket.delta
    );

    // 8. Cheer 생성 (pending 상태)
    const cheerId = uuidv4();
    const nowISO = now.toISOString();

    const cheer = {
      cheerId,
      senderId: userId,
      receiverId: input.receiverId,
      verificationId: null,
      cheerType: 'scheduled',
      message: input.message,
      senderDelta: ticket.delta,
      scheduledTime,
      status: 'pending',
      isRead: false,
      isThanked: false,
      thankedAt: null,
      createdAt: nowISO,
      sentAt: null
    };

    await docClient.send(new PutCommand({
      TableName: process.env.CHEERS_TABLE!,
      Item: cheer
    }));

    // 9. 응원권 상태 업데이트
    await docClient.send(new UpdateCommand({
      TableName: process.env.USER_CHEER_TICKETS_TABLE!,
      Key: { ticketId: input.ticketId },
      UpdateExpression: 'SET #status = :status, usedAt = :usedAt, usedForCheerId = :cheerId',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'used',
        ':usedAt': nowISO,
        ':cheerId': cheerId
      }
    }));

    // 10. EventBridge 스케줄 등록
    await scheduleCheerDelivery(cheerId, scheduledTime);

    // 11. 응답
    const scheduledDate = new Date(scheduledTime);
    const formattedTime = scheduledDate.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return response(200, {
      success: true,
      message: `${formattedTime}에 자동으로 응원이 전달돼요!`,
      data: {
        cheerId,
        scheduledTime,
        ticketUsed: true,
        delta: ticket.delta
      }
    });

  } catch (error: any) {
    console.error('Use ticket error:', error);

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