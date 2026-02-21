// infra/stacks/verification-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as path from 'path';

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

    const submit = new NodejsFunction(this, 'Submit', {
      functionName: `chme-${stage}-verification-submit`,
      entry: path.join(__dirname, '../../backend/services/verification/submit/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      environment: {
        STAGE: stage,
        VERIFICATIONS_TABLE: verificationsTable.tableName,
        USER_CHALLENGES_TABLE: userChallengesTable.tableName,
        UPLOADS_BUCKET: uploadsBucket.bucketName,
      },
    });

    verificationsTable.grantReadWriteData(submit);

    apiGateway.addRoutes({
      path: '/verifications',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SubmitIntegration', submit),
    });
  }
}