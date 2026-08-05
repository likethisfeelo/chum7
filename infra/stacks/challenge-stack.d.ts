import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
interface ChallengeStackProps extends StackProps {
    stage: string;
    apiGateway: HttpApi;
    authorizer: HttpJwtAuthorizer;
    challengesTable: Table;
    userChallengesTable: Table;
}
export declare class ChallengeStack extends Stack {
    constructor(scope: Construct, id: string, props: ChallengeStackProps);
}
export {};
