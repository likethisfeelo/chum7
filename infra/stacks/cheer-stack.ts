// infra/stacks/cheer-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EventBus } from 'aws-cdk-lib/aws-events';
import * as path from 'path';

interface CheerStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  cheersTable: Table;
  userCheerTicketsTable: Table;
  snsTopic: Topic;
  eventBus: EventBus;
}

export class CheerStack extends Stack {
  constructor(scope: Construct, id: string, props: CheerStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, cheersTable, userCheerTicketsTable } = props;

    const sendCheerFunction = new NodejsFunction(this, 'SendCheerFunction', {
      functionName: `chme-${stage}-cheer-send`,
      entry: path.join(__dirname, '../../backend/services/cheer/send/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
    });

    cheersTable.grantReadWriteData(sendCheerFunction);
    userCheerTicketsTable.grantReadWriteData(sendCheerFunction);

    apiGateway.addRoutes({
      path: '/cheer/send',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SendCheerIntegration', sendCheerFunction),
    });
  }
}