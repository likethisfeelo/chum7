import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

interface PersonalFeedStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  usersTable: Table;
  userChallengesTable: Table;
  verificationsTable: Table;
  cheersTable: Table;
  badgesTable: Table;
}

export class PersonalFeedStack extends Stack {
  constructor(scope: Construct, id: string, props: PersonalFeedStackProps) {
    super(scope, id, props);

    const {
      stage,
      apiGateway,
      authorizer,
      usersTable,
      userChallengesTable,
      verificationsTable,
      cheersTable,
      badgesTable,
    } = props;

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
      USERS_TABLE: usersTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
      VERIFICATIONS_TABLE: verificationsTable.tableName,
      CHEERS_TABLE: cheersTable.tableName,
      BADGES_TABLE: badgesTable.tableName,
    };

    // 1. GET /personal-feed/:userId — 피드 프로필 조회
    const profileFn = new NodejsFunction(this, 'PersonalFeedProfileFn', {
      ...commonProps,
      functionName: `chme-${stage}-personal-feed-profile`,
      entry: path.join(__dirname, '../../backend/services/personal-feed/profile/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    usersTable.grantReadData(profileFn);
    apiGateway.addRoutes({
      path: '/personal-feed/{userId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PersonalFeedProfileIntegration', profileFn),
      authorizer,
    });

    // 2. GET /personal-feed/:userId/achievements — 시스템 업적 조회
    const achievementsFn = new NodejsFunction(this, 'PersonalFeedAchievementsFn', {
      ...commonProps,
      functionName: `chme-${stage}-personal-feed-achievements`,
      entry: path.join(__dirname, '../../backend/services/personal-feed/achievements/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    userChallengesTable.grantReadData(achievementsFn);
    verificationsTable.grantReadData(achievementsFn);
    cheersTable.grantReadData(achievementsFn);
    badgesTable.grantReadData(achievementsFn);
    apiGateway.addRoutes({
      path: '/personal-feed/{userId}/achievements',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PersonalFeedAchievementsIntegration', achievementsFn),
      authorizer,
    });
  }
}
