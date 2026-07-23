import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { resolveStageConfig } from '../config/stages';
import { DOMAIN_TABLES, StatefulStack } from '../stacks/stateful-stack';
import { WorkersStack } from '../stacks/workers-stack';
import { ApiStack } from '../stacks/api-stack';

function synthAll(stage: 'dev' | 'prod') {
  const app = new cdk.App();
  const config = resolveStageConfig(stage);
  const env = { account: '111111111111', region: 'ap-northeast-2' };
  const stateful = new StatefulStack(app, `${config.prefix}-stateful`, { env, config });
  const workers = new WorkersStack(app, `${config.prefix}-workers`, { env, config, stateful });
  const api = new ApiStack(app, `${config.prefix}-api`, {
    env,
    config,
    stateful,
    eventBus: workers.eventBus,
  });
  return {
    stateful: Template.fromStack(stateful),
    workers: Template.fromStack(workers),
    api: Template.fromStack(api),
  };
}

describe('infra2 stacks', () => {
  const dev = synthAll('dev');

  it('StatefulStack — 도메인 테이블 9개 (REDESIGN_PLAN §3.3)', () => {
    dev.stateful.resourceCountIs('AWS::DynamoDB::Table', DOMAIN_TABLES.length);
  });

  it('StatefulStack — Cognito 그룹 3종 (admins/operators/creators)', () => {
    dev.stateful.resourceCountIs('AWS::Cognito::UserPoolGroup', 3);
    for (const group of ['admins', 'operators', 'creators']) {
      dev.stateful.hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: group });
    }
  });

  it('StatefulStack — 시크릿 셸 4종 (PG/본인확인/VAPID/익명솔트)', () => {
    dev.stateful.resourceCountIs('AWS::SecretsManager::Secret', 4);
  });

  it('prod — 모든 테이블과 Cognito가 RETAIN (데이터 보호)', () => {
    const prod = synthAll('prod');
    const tables = prod.stateful.findResources('AWS::DynamoDB::Table');
    expect(Object.keys(tables)).toHaveLength(DOMAIN_TABLES.length);
    for (const table of Object.values(tables)) {
      expect(table.DeletionPolicy).toBe('Retain');
      expect(table.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled).toBe(true);
    }
    const pools = prod.stateful.findResources('AWS::Cognito::UserPool');
    for (const pool of Object.values(pools)) {
      expect(pool.DeletionPolicy).toBe('Retain');
    }
  });

  it('ApiStack — /u 프록시는 JWT authorizer, /auth·/health는 퍼블릭', () => {
    // 메서드별로 라우트가 하나씩 생성된다(OPTIONS 제외 — 프리플라이트는 API GW가 처리)
    dev.api.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /u/{proxy+}',
      AuthorizationType: 'JWT',
    });
    for (const routeKey of ['POST /auth/{proxy+}', 'GET /health']) {
      const routes = dev.api.findResources('AWS::ApiGatewayV2::Route', {
        Properties: { RouteKey: routeKey },
      });
      expect(Object.keys(routes)).toHaveLength(1);
      const route = Object.values(routes)[0]!;
      expect(route.Properties.AuthorizationType ?? 'NONE').toBe('NONE');
      expect(route.Properties.AuthorizerId).toBeUndefined();
    }
  });

  it('ApiStack — OPTIONS 라우트는 없다(프리플라이트는 API Gateway CORS가 자동 응답)', () => {
    const routes = dev.api.findResources('AWS::ApiGatewayV2::Route');
    const optionsRoutes = Object.values(routes).filter((r) =>
      String(r.Properties.RouteKey).startsWith('OPTIONS '),
    );
    expect(optionsRoutes).toHaveLength(0);
  });

  it('ApiStack — 맨 경로와 프록시 경로가 둘 다 등록된다(루트 핸들러 도달성)', () => {
    // {proxy+}는 하위 세그먼트를 요구하므로 GET /public/challenges(목록) 같은 루트 핸들러가
    // 죽지 않도록 정확 경로도 등록되어야 한다.
    for (const routeKey of ['GET /public/challenges', 'GET /public/challenges/{proxy+}']) {
      const routes = dev.api.findResources('AWS::ApiGatewayV2::Route', {
        Properties: { RouteKey: routeKey },
      });
      expect(Object.keys(routes)).toHaveLength(1);
    }
  });

  it('ApiStack — user-api에 도메인 테이블 env 주입', () => {
    dev.api.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'chme2-dev-user-api',
      Environment: {
        Variables: Match.objectLike({
          USERS_TABLE: Match.anyValue(),
          USER_POOL_CLIENT_ID: Match.anyValue(),
          EVENT_BUS_NAME: Match.anyValue(),
        }),
      },
    });
  });

  it('WorkersStack — 커스텀 버스 + chme.* 소스 규칙 + DLQ', () => {
    dev.workers.hasResourceProperties('AWS::Events::EventBus', { Name: 'chme2-dev-bus' });
    dev.workers.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: { source: [{ prefix: 'chme.' }] },
    });
    dev.workers.resourceCountIs('AWS::SQS::Queue', 2); // notification + settlement DLQ
  });
});
