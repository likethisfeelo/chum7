import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EventBus } from 'aws-cdk-lib/aws-events';
interface CheerStackProps extends StackProps {
    stage: string;
    apiGateway: HttpApi;
    authorizer: HttpJwtAuthorizer;
    cheersTable: Table;
    userCheerTicketsTable: Table;
    userChallengesTable: Table;
    snsTopic: Topic;
    eventBus: EventBus;
}
export declare class CheerStack extends Stack {
    constructor(scope: Construct, id: string, props: CheerStackProps);
}
export {};
