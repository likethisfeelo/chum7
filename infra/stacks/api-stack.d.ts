import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
export interface ApiStackProps extends StackProps {
    stage: string;
    userPoolId: string;
    userPoolClientId: string;
}
export declare class ApiStack extends Stack {
    readonly apiGateway: HttpApi;
    readonly cognitoAuthorizer: HttpJwtAuthorizer;
    constructor(scope: Construct, id: string, props: ApiStackProps);
}
