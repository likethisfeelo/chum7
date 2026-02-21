// infra/stacks/verification-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import * as path from 'path';

export interface VerificationStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  verificationsTable: Table;
  userChallengesTable: Table;
  uploadsBucket: Bucket;
}

export class VerificationStack extends Stack {
  constructor(scope: Construct, id: string, props: VerificationStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, verificationsTable, userChallengesTable, uploadsBucket } = props;

    const commonEnv = {
      STAGE: stage,
      VERIFICATIONS_TABLE: verificationsTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
      UPLOADS_BUCKET: uploadsBucket.bucketName,
    };

    // ==================== Submit Verification Lambda ====================
    const submitFunction = new NodejsFunction(this, 'SubmitFunction', {
      functionName: `chme-${stage}-verification-submit`,
      entry: path.join(__dirname, '../../backend/services/verification/submit/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    verificationsTable.grantReadWriteData(submitFunction);
    userChallengesTable.grantReadWriteData(submitFunction);

    apiGateway.addRoutes({
      path: '/verifications',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('VerificationSubmitIntegration', submitFunction),
    });

    // ==================== Get Verification Lambda ====================
    const getFunction = new NodejsFunction(this, 'GetFunction', {
      functionName: `chme-${stage}-verification-get`,
      entry: path.join(__dirname, '../../backend/services/verification/get/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    verificationsTable.grantReadData(getFunction);

    apiGateway.addRoutes({
      path: '/verifications/{verificationId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('VerificationGetIntegration', getFunction),
    });

    // ==================== List Verifications Lambda ====================
    const listFunction = new NodejsFunction(this, 'ListFunction', {
      functionName: `chme-${stage}-verification-list`,
      entry: path.join(__dirname, '../../backend/services/verification/list/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    verificationsTable.grantReadData(listFunction);

    apiGateway.addRoutes({
      path: '/verifications',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('VerificationListIntegration', listFunction),
    });

    // ==================== Upload URL Lambda ====================
    const uploadUrlFunction = new NodejsFunction(this, 'UploadUrlFunction', {
      functionName: `chme-${stage}-verification-upload-url`,
      entry: path.join(__dirname, '../../backend/services/verification/upload-url/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    uploadsBucket.grantPut(uploadUrlFunction);

    apiGateway.addRoutes({
      path: '/verifications/upload-url',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('VerificationUploadUrlIntegration', uploadUrlFunction),
    });

    // ==================== Remedy (Day 6 보완) Lambda ====================
    const remedyFunction = new NodejsFunction(this, 'RemedyFunction', {
      functionName: `chme-${stage}-verification-remedy`,
      entry: path.join(__dirname, '../../backend/services/verification/remedy/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    verificationsTable.grantReadWriteData(remedyFunction);
    userChallengesTable.grantReadWriteData(remedyFunction);

    apiGateway.addRoutes({
      path: '/verifications/remedy',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('VerificationRemedyIntegration', remedyFunction),
    });
  }
}
