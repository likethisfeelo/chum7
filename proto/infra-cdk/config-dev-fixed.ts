// infra/config/dev.ts
export const devConfig = {
  stage: 'dev',
  region: 'ap-northeast-2',
  account: '532393804562',
  
  domain: {
    root: 'chum7.com',
    api: 'dev.chum7.com',
    cdn: 'test.chum7.com',
    app: 'test.chum7.com',
    admin: 'admin-dev.chum7.com',
  },
  
  cognito: {
    userPoolName: 'chum7-dev-users',
    callbackUrls: [
      'https://test.chum7.com/callback',
      'http://localhost:5173/callback',
      'http://localhost:5174/callback',
    ],
    logoutUrls: [
      'https://test.chum7.com',
      'http://localhost:5173',
      'http://localhost:5174',
    ],
  },
  
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST',
  },
  
  s3: {
    // 실제 버킷 이름 (chme-dev는 이미 있는 버킷)
    staticBucket: 'chme-dev',
    uploadsBucket: 'chum7-dev-uploads',
  },
  
  cloudfront: {
    distributionId: 'ESKW3DS5HUUK9', // test.chum7.com
  },
  
  sns: {
    topicName: 'chum7-dev-notifications',
  },
  
  eventBridge: {
    schedulerName: 'chum7-dev-cheer-scheduler',
  },
  
  lambda: {
    timeout: 30,
    memorySize: 256,
  },
};
