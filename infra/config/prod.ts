// infra/config/prod.ts
import { InfraConfig } from './dev';

export const prodConfig: InfraConfig = {
  stage: 'prod',
  region: 'ap-northeast-2',
  account: '532393804562', // ✅ 하드코딩 (환경변수 의존 제거)
  
  domain: {
    root: 'chum7.com',
    api: 'api.chum7.com',
    cdn: 'www.chum7.com',
    app: 'www.chum7.com',
    admin: 'admin.chum7.com',
  },
  
  s3: {
    staticBucket: 'chme-prod-static', // ✅ 실제 버킷명 (chum7 아님!)
    uploadsBucket: 'chum7-prod-uploads', // ✅ 실제 버킷명
  },
  
  cognito: {
    userPoolName: 'chum7-prod-users', // ✅ 실제 User Pool 이름 (chme 아님!)
    callbackUrls: [
      'https://www.chum7.com/callback',
      'https://admin.chum7.com/callback',
    ],
    logoutUrls: [
      'https://www.chum7.com',
      'https://admin.chum7.com',
    ],
  },
  
  cloudfront: {
    distributionId: 'EUM1ULUXR9NQZ', // ✅ 실제 Distribution ID
  },
  
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST',
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
};