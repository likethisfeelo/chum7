import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
interface AdminStackProps extends StackProps {
    stage: string;
    apiGateway: HttpApi;
    authorizer: HttpJwtAuthorizer;
    usersTable: Table;
    challengesTable: Table;
    userChallengesTable: Table;
}
export declare class AdminStack extends Stack {
    constructor(scope: Construct, id: string, props: AdminStackProps);
}
export {};
