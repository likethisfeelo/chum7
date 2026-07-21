import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import {
  DomainEventDetail,
  DomainEventType,
  domainEventSchemas,
  EVENT_SOURCE_PREFIX,
} from '@chum7/contracts';

const client = new EventBridgeClient({});

/**
 * 도메인 이벤트 발행. 이벤트는 통지이며 트랜잭션이 아니다 — 발행 실패는 로깅만 하고
 * 호출자의 비즈니스 흐름을 실패시키지 않는다 (REDESIGN_PLAN §3.2).
 */
export async function publishEvent<T extends DomainEventType>(
  type: T,
  detail: DomainEventDetail<T>,
): Promise<void> {
  const busName = process.env.EVENT_BUS_NAME;
  if (!busName) {
    console.warn(JSON.stringify({ level: 'warn', message: 'EVENT_BUS_NAME not set, event dropped', type }));
    return;
  }
  const domain = type.split('.')[0];
  domainEventSchemas[type].parse(detail);
  try {
    await client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: busName,
            Source: `${EVENT_SOURCE_PREFIX}${domain}`,
            DetailType: type,
            Detail: JSON.stringify({ ...detail, occurredAt: new Date().toISOString() }),
          },
        ],
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({ level: 'error', message: 'publishEvent failed', type, error: (error as Error).message }),
    );
  }
}
