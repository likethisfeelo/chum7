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
    userPoolName: 'chme-dev-users',
    callbackUrls: [
      'https://test.chum7.com/callback',
      'http://localhost:5173/callback',
    ],
    logoutUrls: [
      'https://test.chum7.com',
      'http://localhost:5173',
    ],
  },
  
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST', // 초기에는 On-Demand
  },
  
  s3: {
    staticBucket: 'chme-dev-static',
    uploadsBucket: 'chme-dev-uploads',
  },
  
  cloudfront: {
    // 실제 Distribution ID는 배포 후 수동으로 업데이트
    distributionId: 'E1234567890ABC', // TODO: 배포 후 실제 ID로 변경
  },
  
  sns: {
    topicName: 'chme-dev-notifications',
  },
  
  eventBridge: {
    schedulerName: 'chme-dev-cheer-scheduler',
  },
  
  lambda: {
    timeout: 30, // seconds
    memorySize: 256, // MB
  },
};
