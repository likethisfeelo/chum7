import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

interface CharacterStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  charactersTable: Table;
  usersTable: Table;
}

export class CharacterStack extends Stack {
  constructor(scope: Construct, id: string, props: CharacterStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, authorizer, charactersTable, usersTable } = props;

    const commonProps = {
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: stage === 'dev',
        externalModules: ['@aws-sdk/*'],
      },
    };

    const commonEnv = {
      STAGE: stage,
      CHARACTERS_TABLE: charactersTable.tableName,
      USERS_TABLE: usersTable.tableName,
    };

    // POST /characters/me/start — 온보딩: 세계관 선택 + 첫 캐릭터 배정
    const startFn = new NodejsFunction(this, 'CharacterStartFn', {
      ...commonProps,
      functionName: `chme-${stage}-character-start`,
      entry: path.join(__dirname, '../../backend/services/character/start/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    charactersTable.grantReadWriteData(startFn);
    usersTable.grantReadWriteData(startFn);
    apiGateway.addRoutes({
      path: '/characters/me/start',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CharacterStartIntegration', startFn),
      authorizer,
    });

    // GET /characters/me/status — 현재 진행 상황 + 세계관별 진행률
    const statusFn = new NodejsFunction(this, 'CharacterStatusFn', {
      ...commonProps,
      functionName: `chme-${stage}-character-status`,
      entry: path.join(__dirname, '../../backend/services/character/status/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    charactersTable.grantReadData(statusFn);
    usersTable.grantReadData(statusFn);
    apiGateway.addRoutes({
      path: '/characters/me/status',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('CharacterStatusIntegration', statusFn),
      authorizer,
    });

    // POST /characters/me/next — 캐릭터 완성 후 다음 캐릭터 배정
    const nextFn = new NodejsFunction(this, 'CharacterNextFn', {
      ...commonProps,
      functionName: `chme-${stage}-character-next`,
      entry: path.join(__dirname, '../../backend/services/character/next/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    charactersTable.grantReadWriteData(nextFn);
    usersTable.grantReadWriteData(nextFn);
    apiGateway.addRoutes({
      path: '/characters/me/next',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CharacterNextIntegration', nextFn),
      authorizer,
    });

    // GET /characters/me/collection — 완성된 캐릭터 컬렉션
    const collectionFn = new NodejsFunction(this, 'CharacterCollectionFn', {
      ...commonProps,
      functionName: `chme-${stage}-character-collection`,
      entry: path.join(__dirname, '../../backend/services/character/collection/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    charactersTable.grantReadData(collectionFn);
    apiGateway.addRoutes({
      path: '/characters/me/collection',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('CharacterCollectionIntegration', collectionFn),
      authorizer,
    });

    // PUT /characters/me/theme — 완성한 세계관 테마 적용/해제
    const themeFn = new NodejsFunction(this, 'CharacterThemeFn', {
      ...commonProps,
      functionName: `chme-${stage}-character-theme`,
      entry: path.join(__dirname, '../../backend/services/character/theme/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    usersTable.grantReadWriteData(themeFn);
    apiGateway.addRoutes({
      path: '/characters/me/theme',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('CharacterThemeIntegration', themeFn),
      authorizer,
    });
  }
}
