// infra/stacks/auth-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

export interface AuthStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  userPool: UserPool;
  usersTable: Table;
}

export class AuthStack extends Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, userPool, usersTable } = props;

    // Lambda 공통 환경 변수
    const commonEnv = {
      STAGE: stage,
      USERS_TABLE: usersTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
    };

    // ==================== Register Lambda ====================
    const registerFunction = new NodejsFunction(this, 'RegisterFunction', {
      functionName: `chme-${stage}-auth-register`,
      entry: path.join(__dirname, '../../backend/services/auth/register/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    usersTable.grantReadWriteData(registerFunction);

    apiGateway.addRoutes({
      path: '/auth/register',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RegisterIntegration', registerFunction),
    });

    // ==================== Login Lambda ====================
    const loginFunction = new NodejsFunction(this, 'LoginFunction', {
      functionName: `chme-${stage}-auth-login`,
      entry: path.join(__dirname, '../../backend/services/auth/login/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    usersTable.grantReadData(loginFunction);

    apiGateway.addRoutes({
      path: '/auth/login',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('LoginIntegration', loginFunction),
    });

    // ==================== Refresh Token Lambda ====================
    const refreshTokenFunction = new NodejsFunction(this, 'RefreshTokenFunction', {
      functionName: `chme-${stage}-auth-refresh`,
      entry: path.join(__dirname, '../../backend/services/auth/refresh-token/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    apiGateway.addRoutes({
      path: '/auth/refresh',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RefreshTokenIntegration', refreshTokenFunction),
    });

    // ==================== Get Profile Lambda ====================
    const getProfileFunction = new NodejsFunction(this, 'GetProfileFunction', {
      functionName: `chme-${stage}-auth-get-profile`,
      entry: path.join(__dirname, '../../backend/services/auth/get-profile/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    usersTable.grantReadData(getProfileFunction);

    apiGateway.addRoutes({
      path: '/auth/profile',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetProfileIntegration', getProfileFunction),
    });

    // ==================== Update Profile Lambda ====================
    const updateProfileFunction = new NodejsFunction(this, 'UpdateProfileFunction', {
      functionName: `chme-${stage}-auth-update-profile`,
      entry: path.join(__dirname, '../../backend/services/auth/update-profile/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    usersTable.grantReadWriteData(updateProfileFunction);

    apiGateway.addRoutes({
      path: '/auth/profile',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('UpdateProfileIntegration', updateProfileFunction),
    });
  }
}
