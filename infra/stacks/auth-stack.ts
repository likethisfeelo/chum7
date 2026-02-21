// infra/stacks/auth-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import * as path from 'path';

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
      runtime: Runtime.NODEJS_20_X,
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

    const registerFunction = new NodejsFunction(this, 'RegisterFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-auth-register`,
      entry: path.join(__dirname, '../../backend/services/auth/register/index.ts'),
      handler: 'handler',
    });

    usersTable.grantWriteData(registerFunction);

    apiGateway.addRoutes({
      path: '/auth/register',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RegisterIntegration', registerFunction),
    });

    const loginFunction = new NodejsFunction(this, 'LoginFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-auth-login`,
      entry: path.join(__dirname, '../../backend/services/auth/login/index.ts'),
      handler: 'handler',
    });

    usersTable.grantReadData(loginFunction);

    apiGateway.addRoutes({
      path: '/auth/login',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('LoginIntegration', loginFunction),
    });
  }
}