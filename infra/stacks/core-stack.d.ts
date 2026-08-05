import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { UserPool, UserPoolClient, CfnUserPoolGroup } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EventBus } from 'aws-cdk-lib/aws-events';
export interface CoreStackProps extends StackProps {
    stage: string;
    config: any;
}
export declare class CoreStack extends Stack {
    readonly userPool: UserPool;
    readonly userPoolClient: UserPoolClient;
    readonly adminsGroup: CfnUserPoolGroup;
    readonly usersTable: Table;
    readonly challengesTable: Table;
    readonly userChallengesTable: Table;
    readonly verificationsTable: Table;
    readonly cheersTable: Table;
    readonly userCheerTicketsTable: Table;
    readonly questsTable: Table;
    readonly questSubmissionsTable: Table;
    readonly activeQuestSubmissionsTable: Table;
    readonly bulletinPostsTable: Table;
    readonly bulletinCommentsTable: Table;
    readonly bulletinLikesTable: Table;
    readonly uploadsBucket: IBucket;
    readonly snsTopic: Topic;
    readonly eventBus: EventBus;
    constructor(scope: Construct, id: string, props: CoreStackProps);
}
