// infra/config/dev.ts

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

export const devConfig: InfraConfig = {
  stage: 'dev',
  region: 'ap-northeast-2',
  account: '532393804562', // ✅ 하드코딩 (환경변수 의존 제거)
  
  domain: {
    root: 'chum7.com',
    api: 'dev.chum7.com',
    cdn: 'test.chum7.com',
    app: 'test.chum7.com',
    admin: 'admin-dev.chum7.com',
  },
  
  s3: {
    staticBucket: 'chme-dev', // ✅ 실제 버킷명 (이미 존재)
    uploadsBucket: 'chum7-dev-uploads', // ✅ 실제 버킷명 (이미 존재)
  },
  
  cognito: {
    userPoolName: 'chum7-dev-users', // ✅ 실제 User Pool 이름
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
  
  cloudfront: {
    distributionId: 'ESKW3DS5HUUK9', // ✅ 실제 Distribution ID (오타 수정)
  },
  
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST',
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