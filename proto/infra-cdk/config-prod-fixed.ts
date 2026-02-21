// infra/config/prod.ts
export const prodConfig = {
  stage: 'prod',
  region: 'ap-northeast-2',
  account: '532393804562',
  
  domain: {
    root: 'chum7.com',
    api: 'api.chum7.com',
    cdn: 'www.chum7.com',
    app: 'www.chum7.com',
    admin: 'admin.chum7.com',
  },
  
  cognito: {
    userPoolName: 'chum7-prod-users',
    callbackUrls: [
      'https://www.chum7.com/callback',
      'https://admin.chum7.com/callback',
    ],
    logoutUrls: [
      'https://www.chum7.com',
      'https://admin.chum7.com',
    ],
  },
  
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST',
  },
  
  s3: {
    // 실제 버킷 이름 (chme-prod-static은 이미 있는 버킷)
    staticBucket: 'chme-prod-static',
    uploadsBucket: 'chum7-prod-uploads',
  },
  
  cloudfront: {
    distributionId: 'EUM1ULUXR9NQZ', // www.chum7.com, admin.chum7.com
  },
  
  sns: {
    topicName: 'chum7-prod-notifications',
  },
  
  eventBridge: {
    schedulerName: 'chum7-prod-cheer-scheduler',
  },
  
  lambda: {
    timeout: 30,
    memorySize: 256,
  },
  
  // PROD 전용 설정
  monitoring: {
    enableDetailedMetrics: true,
    alarmEmail: 'admin@chum7.com',
  },
  
  backup: {
    enablePointInTimeRecovery: true,
    retentionDays: 30,
  },
};
