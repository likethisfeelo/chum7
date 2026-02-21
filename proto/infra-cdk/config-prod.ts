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
    userPoolName: 'chme-prod-users',
    callbackUrls: [
      'https://www.chum7.com/callback',
    ],
    logoutUrls: [
      'https://www.chum7.com',
    ],
  },
  
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST', // 초기에는 On-Demand, 추후 Provisioned로 전환
  },
  
  s3: {
    staticBucket: 'chum7-prod-static',
    uploadsBucket: 'chum7-prod-uploads',
  },
  
  cloudfront: {
    // 실제 Distribution ID는 배포 후 수동으로 업데이트
    distributionId: 'EUM1ULUXR9NQZ', // TODO: 배포 후 실제 ID로 변경
  },
  
  sns: {
    topicName: 'chme-prod-notifications',
  },
  
  eventBridge: {
    schedulerName: 'chme-prod-cheer-scheduler',
  },
  
  lambda: {
    timeout: 30, // seconds
    memorySize: 256, // MB
  },
  
  // PROD 전용 설정
  monitoring: {
    enableDetailedMetrics: true,
    alarmEmail: 'admin@chum7.com', // 알람 받을 이메일
  },
  
  backup: {
    enablePointInTimeRecovery: true, // DynamoDB PITR
    retentionDays: 30,
  },
};
