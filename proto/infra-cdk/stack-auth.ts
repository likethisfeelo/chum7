// infra/stacks/auth-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { UserPool } from 'aws-cdk-lib/aws-cognito';

interface AuthStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  userPool: UserPool;
  usersTable: Table;
}

export class AuthStack extends Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, userPool, usersTable } = props;

    const commonLambdaProps = {
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        STAGE: stage,
        USERS_TABLE: usersTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
      },
      bundling: {
        minify: true,
        sourceMap: stage === 'dev',
        externalModules: ['@aws-sdk/*'],
      },
    };

    // ==================== 1. Register ====================
    const registerFunction = new NodejsFunction(this, 'RegisterFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-auth-register`,
      entry: '../backend/services/auth/register/index.ts',
      handler: 'handler',
    });
    usersTable.grantWriteData(registerFunction);

    apiGateway.addRoutes({
      path: '/auth/register',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RegisterIntegration', registerFunction),
    });

    // ==================== 2. Login ====================
    const loginFunction = new NodejsFunction(this, 'LoginFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-auth-login`,
      entry: '../backend/services/auth/login/index.ts',
      handler: 'handler',
    });
    usersTable.grantReadData(loginFunction);

    apiGateway.addRoutes({
      path: '/auth/login',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('LoginIntegration', loginFunction),
    });

    // ==================== 3. Refresh Token ====================
    const refreshFunction = new NodejsFunction(this, 'RefreshFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-auth-refresh`,
      entry: '../backend/services/auth/refresh-token/index.ts',
      handler: 'handler',
    });

    apiGateway.addRoutes({
      path: '/auth/refresh',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RefreshIntegration', refreshFunction),
    });

    // ==================== 4. Get Profile ====================
    const getProfileFunction = new NodejsFunction(this, 'GetProfileFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-auth-get-profile`,
      entry: '../backend/services/auth/get-profile/index.ts',
      handler: 'handler',
    });
    usersTable.grantReadData(getProfileFunction);

    apiGateway.addRoutes({
      path: '/auth/profile',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetProfileIntegration', getProfileFunction),
    });

    // ==================== 5. Update Profile ====================
    const updateProfileFunction = new NodejsFunction(this, 'UpdateProfileFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-auth-update-profile`,
      entry: '../backend/services/auth/update-profile/index.ts',
      handler: 'handler',
    });
    usersTable.grantReadWriteData(updateProfileFunction);

    apiGateway.addRoutes({
      path: '/auth/profile',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('UpdateProfileIntegration', updateProfileFunction),
    });
  }
}
