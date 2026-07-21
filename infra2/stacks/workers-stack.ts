import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { join } from 'node:path';
import { StatefulStack } from './stateful-stack';
import { StageConfig } from '../config/stages';

export interface WorkersStackProps extends cdk.StackProps {
  config: StageConfig;
  stateful: StatefulStack;
}

/**
 * 이벤트 버스 + 워커 (REDESIGN_PLAN §3.2).
 * Phase 1: notification-worker (버스의 첫 소비자).
 * Phase 2~3에서 lifecycle-manager, cheer-scheduler, plaza-converter,
 * cheer-stats-materializer, settlement-worker, shipping-tracker가 추가된다.
 */
export class WorkersStack extends cdk.Stack {
  readonly eventBus: events.EventBus;
  readonly notificationWorker: NodejsFunction;
  readonly workerFunctions: NodejsFunction[] = [];

  constructor(scope: Construct, id: string, props: WorkersStackProps) {
    super(scope, id, props);
    const { config, stateful } = props;

    this.eventBus = new events.EventBus(this, 'DomainBus', {
      eventBusName: `${config.prefix}-bus`,
    });

    this.notificationWorker = new NodejsFunction(this, 'NotificationWorker', {
      functionName: `${config.prefix}-notification-worker`,
      entry: join(__dirname, '../../services/workers/notification-worker/src/index.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: { minify: true, sourceMap: !config.isProd, externalModules: ['@aws-sdk/*'] },
      environment: {
        STAGE: config.stage,
        USERS_TABLE: stateful.tables.users.tableName,
      },
    });
    stateful.tables.users.grantReadWriteData(this.notificationWorker);
    this.workerFunctions.push(this.notificationWorker);

    const dlq = new sqs.Queue(this, 'NotificationDlq', {
      queueName: `${config.prefix}-notification-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    new events.Rule(this, 'DomainEventsToNotifier', {
      eventBus: this.eventBus,
      ruleName: `${config.prefix}-domain-events`,
      eventPattern: { source: [{ prefix: 'chme.' }] as unknown as string[] },
      targets: [
        new eventsTargets.LambdaFunction(this.notificationWorker, {
          deadLetterQueue: dlq,
          retryAttempts: 2,
        }),
      ],
    });

    // --- cheer-scheduler: 5분 주기 예약 응원 발송 ---
    const cheerScheduler = new NodejsFunction(this, 'CheerScheduler', {
      functionName: `${config.prefix}-cheer-scheduler`,
      entry: join(__dirname, '../../services/workers/cheer-scheduler/src/index.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(4),
      memorySize: 256,
      bundling: { minify: true, sourceMap: !config.isProd, externalModules: ['@aws-sdk/*'] },
      environment: {
        STAGE: config.stage,
        CHEER_TABLE: stateful.tables.cheer.tableName,
        CHALLENGES_TABLE: stateful.tables.challenges.tableName,
        EVENT_BUS_NAME: this.eventBus.eventBusName,
      },
    });
    stateful.tables.cheer.grantReadWriteData(cheerScheduler);
    // thankScore ADD — 레거시 승계 크로스 도메인 쓰기 (services/cheer-api/PORTING.md)
    stateful.tables.challenges.grantReadWriteData(cheerScheduler);
    this.eventBus.grantPutEventsTo(cheerScheduler);
    this.workerFunctions.push(cheerScheduler);

    new events.Rule(this, 'CheerSchedulerRule', {
      ruleName: `${config.prefix}-cheer-scheduler`,
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new eventsTargets.LambdaFunction(cheerScheduler)],
    });

    new cdk.CfnOutput(this, 'EventBusName', { value: this.eventBus.eventBusName });
  }
}
