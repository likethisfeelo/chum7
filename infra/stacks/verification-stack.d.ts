import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { IBucket } from 'aws-cdk-lib/aws-s3';
interface VerificationStackProps extends StackProps {
    stage: string;
    apiGateway: HttpApi;
    authorizer: HttpJwtAuthorizer;
    verificationsTable: Table;
    userChallengesTable: Table;
    uploadsBucket: IBucket;
}
export declare class VerificationStack extends Stack {
    constructor(scope: Construct, id: string, props: VerificationStackProps);
}
export {};
