// infra/stacks/verification-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { IBucket } from 'aws-cdk-lib/aws-s3';

interface VerificationStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  verificationsTable: Table;
  userChallengesTable: Table;
  uploadsBucket: IBucket;
}

export class VerificationStack extends Stack {
  constructor(scope: Construct, id: string, props: VerificationStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, verificationsTable, userChallengesTable, uploadsBucket } = props;

    const commonLambdaProps = {
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        STAGE: stage,
        VERIFICATIONS_TABLE: verificationsTable.tableName,
        USER_CHALLENGES_TABLE: userChallengesTable.tableName,
        UPLOADS_BUCKET: uploadsBucket.bucketName,
      },
      bundling: {
        minify: true,
        sourceMap: stage === 'dev',
        externalModules: ['@aws-sdk/*'],
      },
    };

    // ==================== 1. Submit Verification (핵심!) ====================
    const submitFunction = new NodejsFunction(this, 'SubmitFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-verification-submit`,
      entry: '../backend/services/verification/submit/index.ts',
      handler: 'handler',
    });
    verificationsTable.grantWriteData(submitFunction);
    userChallengesTable.grantReadWriteData(submitFunction);

    apiGateway.addRoutes({
      path: '/verifications',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SubmitIntegration', submitFunction),
    });

    // ==================== 2. Get Verification ====================
    const getFunction = new NodejsFunction(this, 'GetFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-verification-get`,
      entry: '../backend/services/verification/get/index.ts',
      handler: 'handler',
    });
    verificationsTable.grantReadData(getFunction);

    apiGateway.addRoutes({
      path: '/verifications/{verificationId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetIntegration', getFunction),
    });

    // ==================== 3. List Verifications ====================
    const listFunction = new NodejsFunction(this, 'ListFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-verification-list`,
      entry: '../backend/services/verification/list/index.ts',
      handler: 'handler',
    });
    verificationsTable.grantReadData(listFunction);

    apiGateway.addRoutes({
      path: '/verifications',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListIntegration', listFunction),
    });

    // ==================== 4. Upload URL (S3 Presigned) ====================
    const uploadUrlFunction = new NodejsFunction(this, 'UploadUrlFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-verification-upload-url`,
      entry: '../backend/services/verification/upload-url/index.ts',
      handler: 'handler',
    });
    uploadsBucket.grantPut(uploadUrlFunction);

    apiGateway.addRoutes({
      path: '/verifications/upload-url',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('UploadUrlIntegration', uploadUrlFunction),
    });

    // ==================== 5. Day 6 Remedy ====================
    const remedyFunction = new NodejsFunction(this, 'RemedyFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-verification-remedy`,
      entry: '../backend/services/verification/remedy/index.ts',
      handler: 'handler',
    });
    verificationsTable.grantWriteData(remedyFunction);
    userChallengesTable.grantReadWriteData(remedyFunction);

    apiGateway.addRoutes({
      path: '/verifications/remedy',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RemedyIntegration', remedyFunction),
    });
  }
}
