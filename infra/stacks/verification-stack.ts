import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as path from 'path';

interface VerificationStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  verificationsTable: Table;
  userChallengesTable: Table;
  uploadsBucket: IBucket;
}

export class VerificationStack extends Stack {
  constructor(scope: Construct, id: string, props: VerificationStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, authorizer, verificationsTable, userChallengesTable, uploadsBucket } = props;

    const commonEnv = {
      STAGE: stage,
      VERIFICATIONS_TABLE: verificationsTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
      UPLOADS_BUCKET: uploadsBucket.bucketName,
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

    // 1. Submit Verification
    const submitFn = new NodejsFunction(this, 'SubmitFn', {
      ...commonProps,
      functionName: `chme-${stage}-verification-submit`,
      entry: path.join(__dirname, '../../backend/services/verification/submit/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    verificationsTable.grantReadWriteData(submitFn);
    userChallengesTable.grantReadWriteData(submitFn);
    apiGateway.addRoutes({
      path: '/verifications',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SubmitIntegration', submitFn),
      authorizer,
    });

    // 2. Get Verification (protected)
    const getFn = new NodejsFunction(this, 'GetFn', {
      ...commonProps,
      functionName: `chme-${stage}-verification-get`,
      entry: path.join(__dirname, '../../backend/services/verification/get/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    verificationsTable.grantReadData(getFn);
    apiGateway.addRoutes({
      path: '/verifications/{verificationId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetVerificationIntegration', getFn),
      authorizer,
    });

    // 3. List Verifications (protected)
    const listFn = new NodejsFunction(this, 'ListFn', {
      ...commonProps,
      functionName: `chme-${stage}-verification-list`,
      entry: path.join(__dirname, '../../backend/services/verification/list/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    verificationsTable.grantReadData(listFn);
    userChallengesTable.grantReadData(listFn);
    uploadsBucket.grantRead(listFn);
    apiGateway.addRoutes({
      path: '/verifications',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListVerificationIntegration', listFn),
      authorizer,
    });

    // 4. Upload URL (S3 Presigned URL) (protected)
    const uploadUrlFn = new NodejsFunction(this, 'UploadUrlFn', {
      ...commonProps,
      functionName: `chme-${stage}-verification-upload-url`,
      entry: path.join(__dirname, '../../backend/services/verification/upload-url/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    uploadsBucket.grantPut(uploadUrlFn);
    apiGateway.addRoutes({
      path: '/verifications/upload-url',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('UploadUrlIntegration', uploadUrlFn),
      authorizer,
    });

    // 5. Remedy Verification (Day 6 보완) (protected)
    const remedyFn = new NodejsFunction(this, 'RemedyFn', {
      ...commonProps,
      functionName: `chme-${stage}-verification-remedy`,
      entry: path.join(__dirname, '../../backend/services/verification/remedy/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    verificationsTable.grantReadWriteData(remedyFn);
    userChallengesTable.grantReadWriteData(remedyFn);
    apiGateway.addRoutes({
      path: '/verifications/remedy',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RemedyIntegration', remedyFn),
      authorizer,
    });
  }
}
