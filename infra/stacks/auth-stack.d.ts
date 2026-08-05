import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
interface AuthStackProps extends StackProps {
    stage: string;
    apiGateway: HttpApi;
    authorizer: HttpJwtAuthorizer;
    userPool: UserPool;
    userPoolClient: UserPoolClient;
    usersTable: Table;
}
export declare class AuthStack extends Stack {
    constructor(scope: Construct, id: string, props: AuthStackProps);
}
export {};
