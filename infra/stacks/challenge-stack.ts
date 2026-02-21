// infra/stacks/challenge-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

interface ChallengeStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  challengesTable: Table;
  userChallengesTable: Table;
}

export class ChallengeStack extends Stack {
  constructor(scope: Construct, id: string, props: ChallengeStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, challengesTable, userChallengesTable } = props;

    const listFunction = new NodejsFunction(this, 'ListChallengeFunction', {
      functionName: `chme-${stage}-challenge-list`,
      entry: path.join(__dirname, '../../backend/services/challenge/list/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
    });

    challengesTable.grantReadData(listFunction);

    apiGateway.addRoutes({
      path: '/challenges',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ChallengeListIntegration', listFunction),
    });

    const joinFunction = new NodejsFunction(this, 'JoinChallengeFunction', {
      functionName: `chme-${stage}-challenge-join`,
      entry: path.join(__dirname, '../../backend/services/challenge/join/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
    });

    userChallengesTable.grantReadWriteData(joinFunction);

    apiGateway.addRoutes({
      path: '/challenges/join',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ChallengeJoinIntegration', joinFunction),
    });
  }
}