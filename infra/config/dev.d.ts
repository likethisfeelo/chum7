export interface InfraConfig {
    stage: string;
    region: string;
    account: string;
    domain: {
        root: string;
        api: string;
        cdn: string;
        app: string;
        admin: string;
    };
    s3: {
        staticBucket: string;
        uploadsBucket: string;
    };
    cognito: {
        userPoolName: string;
        callbackUrls: string[];
        logoutUrls: string[];
    };
    cloudfront: {
        distributionId: string;
    };
    dynamodb: {
        billingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';
    };
    sns: {
        topicName: string;
    };
    eventBridge: {
        schedulerName: string;
    };
    lambda: {
        timeout: number;
        memorySize: number;
    };
}
export declare const devConfig: InfraConfig;
