import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { InfraConfig } from '../config';
export interface DynamoDBStackProps extends StackProps {
    config: InfraConfig;
}
export declare class DynamoDBStack extends Stack {
    readonly usersTable: dynamodb.Table;
    readonly challengesTable: dynamodb.Table;
    readonly userChallengesTable: dynamodb.Table;
    readonly verificationsTable: dynamodb.Table;
    readonly cheersTable: dynamodb.Table;
    readonly userCheerTicketsTable: dynamodb.Table;
    constructor(scope: Construct, id: string, props: DynamoDBStackProps);
}
