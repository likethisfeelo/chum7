import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import * as path from 'path';

interface AuthStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  usersTable: Table;
}

export class AuthStack extends Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, authorizer, userPool, userPoolClient, usersTable } = props;

    const commonEnv = {
      STAGE: stage,
      USERS_TABLE: usersTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
    };

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

    // 1. Register (public)
    const registerFn = new NodejsFunction(this, 'RegisterFn', {
      ...commonProps,
      functionName: `chme-${stage}-auth-register`,
      entry: path.join(__dirname, '../../backend/services/auth/register/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    usersTable.grantReadWriteData(registerFn);
    // dev에서 자동 이메일 인증 확인을 위한 Cognito 권한
    registerFn.addToRolePolicy(new PolicyStatement({
      actions: ['cognito-idp:AdminConfirmSignUp'],
      resources: [userPool.userPoolArn],
    }));
    apiGateway.addRoutes({
      path: '/auth/register',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RegisterIntegration', registerFn),
    });

    // 2. Login (public)
    const loginFn = new NodejsFunction(this, 'LoginFn', {
      ...commonProps,
      functionName: `chme-${stage}-auth-login`,
      entry: path.join(__dirname, '../../backend/services/auth/login/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    usersTable.grantReadData(loginFn);
    apiGateway.addRoutes({
      path: '/auth/login',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('LoginIntegration', loginFn),
    });

    // 3. Refresh Token (public)
    const refreshFn = new NodejsFunction(this, 'RefreshFn', {
      ...commonProps,
      functionName: `chme-${stage}-auth-refresh-token`,
      entry: path.join(__dirname, '../../backend/services/auth/refresh-token/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    apiGateway.addRoutes({
      path: '/auth/refresh',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RefreshIntegration', refreshFn),
    });

    // 4. Get Profile (protected)
    const getProfileFn = new NodejsFunction(this, 'GetProfileFn', {
      ...commonProps,
      functionName: `chme-${stage}-auth-get-profile`,
      entry: path.join(__dirname, '../../backend/services/auth/get-profile/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    usersTable.grantReadData(getProfileFn);
    apiGateway.addRoutes({
      path: '/auth/me',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetProfileIntegration', getProfileFn),
      authorizer,
    });

    // 5. Update Profile (protected)
    const updateProfileFn = new NodejsFunction(this, 'UpdateProfileFn', {
      ...commonProps,
      functionName: `chme-${stage}-auth-update-profile`,
      entry: path.join(__dirname, '../../backend/services/auth/update-profile/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    usersTable.grantReadWriteData(updateProfileFn);
    apiGateway.addRoutes({
      path: '/auth/me',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('UpdateProfileIntegration', updateProfileFn),
      authorizer,
    });
  }
}
