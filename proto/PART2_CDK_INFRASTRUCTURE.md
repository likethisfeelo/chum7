# CHME 프로젝트 전체 코드 모음 (Part 2/3)
## CDK Infrastructure 코드

---

## 📦 CDK 파일 구조

```
infra/
├── bin/
│   └── chme.ts           # CDK 앱 엔트리
├── config/
│   ├── dev.ts            # DEV 환경 설정
│   └── prod.ts           # PROD 환경 설정
├── stacks/
│   ├── core-stack.ts     # 공통 인프라
│   ├── auth-stack.ts     # 인증 스택
│   ├── challenge-stack.ts # 챌린지 스택
│   ├── verification-stack.ts # 인증 스택
│   ├── cheer-stack.ts    # 응원 스택
│   └── admin-stack.ts    # 관리자 스택
├── cdk.json
├── package.json
└── tsconfig.json
```

---

## 📄 config/dev.ts

```typescript
export const devConfig = {
  stage: 'dev',
  region: 'ap-northeast-2',
  account: '532393804562',
  
  domain: {
    root: 'chum7.com',
    api: 'api.chum7.com',
    web: 'test.chum7.com',
    admin: 'admin.chum7.com'
  },
  
  cognito: {
    userPoolId: 'ap-northeast-2_NCbbx3Ilm',
    clientId: '6aalogssb8bb70rtg63a2l7jdb'
  },
  
  s3: {
    staticBucket: 'chme-dev',
    uploadsBucket: 'chum7-dev-uploads'
  },
  
  cloudfront: {
    distributionId: 'ESKW3DS5HUUK9'
  },
  
  tables: {
    users: 'chme-dev-users',
    challenges: 'chme-dev-challenges',
    userChallenges: 'chme-dev-user-challenges',
    verifications: 'chme-dev-verifications',
    cheers: 'chme-dev-cheers',
    userCheerTickets: 'chme-dev-user-cheer-tickets'
  },
  
  lambda: {
    role: 'chum7_lambda_first'
  }
};
```

---

## 📄 config/prod.ts

```typescript
export const prodConfig = {
  stage: 'prod',
  region: 'ap-northeast-2',
  account: '532393804562',
  
  domain: {
    root: 'chum7.com',
    api: 'api.chum7.com',
    web: 'www.chum7.com',
    admin: 'admin.chum7.com'
  },
  
  cognito: {
    userPoolId: 'ap-northeast-2_n8ZjUpupj',
    clientId: '5d62qaq228fap818m8gi8jt759'
  },
  
  s3: {
    staticBucket: 'chme-prod-static',
    uploadsBucket: 'chum7-prod-uploads'
  },
  
  cloudfront: {
    distributionId: 'E3IIQBS1IN0TFJ'
  },
  
  tables: {
    users: 'chme-prod-users',
    challenges: 'chme-prod-challenges',
    userChallenges: 'chme-prod-user-challenges',
    verifications: 'chme-prod-verifications',
    cheers: 'chme-prod-cheers',
    userCheerTickets: 'chme-prod-user-cheer-tickets'
  },
  
  lambda: {
    role: 'chum7_lambda_first'
  }
};
```

---

## 📄 bin/chme.ts

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CoreStack } from '../stacks/core-stack';
import { AuthStack } from '../stacks/auth-stack';
import { ChallengeStack } from '../stacks/challenge-stack';
import { VerificationStack } from '../stacks/verification-stack';
import { CheerStack } from '../stacks/cheer-stack';
import { AdminStack } from '../stacks/admin-stack';
import { devConfig } from '../config/dev';
import { prodConfig } from '../config/prod';

const app = new cdk.App();
const stage = app.node.tryGetContext('stage') || 'dev';
const config = stage === 'prod' ? prodConfig : devConfig;

const env = {
  account: config.account,
  region: config.region
};

// Core Infrastructure
const coreStack = new CoreStack(app, `chme-${stage}-core`, {
  env,
  stage,
  config
});

// Feature Stacks
const authStack = new AuthStack(app, `chme-${stage}-auth`, {
  env,
  stage,
  config,
  apiGateway: coreStack.apiGateway
});

const challengeStack = new ChallengeStack(app, `chme-${stage}-challenge`, {
  env,
  stage,
  config,
  apiGateway: coreStack.apiGateway
});

const verificationStack = new VerificationStack(app, `chme-${stage}-verification`, {
  env,
  stage,
  config,
  apiGateway: coreStack.apiGateway
});

const cheerStack = new CheerStack(app, `chme-${stage}-cheer`, {
  env,
  stage,
  config,
  apiGateway: coreStack.apiGateway
});

const adminStack = new AdminStack(app, `chme-${stage}-admin`, {
  env,
  stage,
  config,
  apiGateway: coreStack.apiGateway
});

// Dependencies
authStack.addDependency(coreStack);
challengeStack.addDependency(coreStack);
verificationStack.addDependency(coreStack);
cheerStack.addDependency(coreStack);
adminStack.addDependency(coreStack);

app.synth();
```

---

## 📄 cdk.json

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/chme.ts",
  "watch": {
    "include": [
      "**"
    ],
    "exclude": [
      "README.md",
      "cdk*.json",
      "**/*.d.ts",
      "**/*.js",
      "tsconfig.json",
      "package*.json",
      "yarn.lock",
      "node_modules",
      "test"
    ]
  },
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true,
    "@aws-cdk/core:target-partitions": [
      "aws",
      "aws-cn"
    ],
    "@aws-cdk-containers/ecs-service-extensions:enableDefaultLogDriver": true,
    "@aws-cdk/aws-ec2:uniqueImdsv2TemplateName": true,
    "@aws-cdk/aws-ecs:arnFormatIncludesClusterName": true,
    "@aws-cdk/aws-iam:minimizePolicies": true,
    "@aws-cdk/core:validateSnapshotRemovalPolicy": true,
    "@aws-cdk/aws-codepipeline:crossAccountKeyAliasStackSafeResourceName": true,
    "@aws-cdk/aws-s3:createDefaultLoggingPolicy": true,
    "@aws-cdk/aws-sns-subscriptions:restrictSqsDescryption": true,
    "@aws-cdk/aws-apigateway:disableCloudWatchRole": true,
    "@aws-cdk/core:enablePartitionLiterals": true,
    "@aws-cdk/aws-events:eventsTargetQueueSameAccount": true,
    "@aws-cdk/aws-iam:standardizedServicePrincipals": true,
    "@aws-cdk/aws-ecs:disableExplicitDeploymentControllerForCircuitBreaker": true,
    "@aws-cdk/aws-iam:importedRoleStackSafeDefaultPolicyName": true,
    "@aws-cdk/aws-s3:serverAccessLogsUseBucketPolicy": true,
    "@aws-cdk/aws-route53-patters:useCertificate": true,
    "@aws-cdk/customresources:installLatestAwsSdkDefault": false,
    "@aws-cdk/aws-rds:databaseProxyUniqueResourceName": true,
    "@aws-cdk/aws-codedeploy:removeAlarmsFromDeploymentGroup": true,
    "@aws-cdk/aws-apigateway:authorizerChangeDeploymentLogicalId": true,
    "@aws-cdk/aws-ec2:launchTemplateDefaultUserData": true,
    "@aws-cdk/aws-secretsmanager:useAttachedSecretResourcePolicyForSecretTargetAttachments": true,
    "@aws-cdk/aws-redshift:columnId": true,
    "@aws-cdk/aws-stepfunctions-tasks:enableEmrServicePolicyV2": true,
    "@aws-cdk/aws-ec2:restrictDefaultSecurityGroup": true,
    "@aws-cdk/aws-apigateway:requestValidatorUniqueId": true,
    "@aws-cdk/aws-kms:aliasNameRef": true,
    "@aws-cdk/aws-autoscaling:generateLaunchTemplateInsteadOfLaunchConfig": true,
    "@aws-cdk/core:includePrefixInUniqueNameGeneration": true,
    "@aws-cdk/aws-opensearchservice:enableOpensearchMultiAzWithStandby": true
  }
}
```

---

## 📄 package.json

```json
{
  "name": "chme-infra",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "cdk": "cdk",
    "deploy:dev": "cdk deploy --all --context stage=dev",
    "deploy:prod": "cdk deploy --all --context stage=prod",
    "diff:dev": "cdk diff --context stage=dev",
    "diff:prod": "cdk diff --context stage=prod",
    "synth:dev": "cdk synth --context stage=dev",
    "synth:prod": "cdk synth --context stage=prod"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "aws-cdk": "^2.114.1",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  },
  "dependencies": {
    "aws-cdk-lib": "^2.114.1",
    "constructs": "^10.3.0",
    "source-map-support": "^0.5.21"
  }
}
```

---

## 📄 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": [
      "ES2020"
    ],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": false,
    "inlineSourceMap": true,
    "inlineSources": true,
    "experimentalDecorators": true,
    "strictPropertyInitialization": false,
    "typeRoots": [
      "./node_modules/@types"
    ],
    "resolveJsonModule": true,
    "esModuleInterop": true
  },
  "exclude": [
    "node_modules",
    "cdk.out"
  ]
}
```

---

## 🚀 CDK 배포 명령어

### DEV 환경 배포
```bash
cd infra

# 전체 배포
npm run deploy:dev

# 특정 스택만 배포
cdk deploy chme-dev-core --context stage=dev
cdk deploy chme-dev-auth --context stage=dev
cdk deploy chme-dev-challenge --context stage=dev
```

### PROD 환경 배포
```bash
cd infra

# 전체 배포
npm run deploy:prod

# Diff 확인 (배포 전)
npm run diff:prod
```

---

## 📝 주요 스택 설명

### 1. Core Stack
- API Gateway (HTTP API)
- CloudWatch Log Groups
- IAM Roles
- EventBridge (예약 응원용)
- SNS Topics (푸시 알림용)

### 2. Auth Stack
- Auth Lambda 함수 5개
- API Routes 5개
- Cognito 연동

### 3. Challenge Stack
- Challenge Lambda 함수 5개
- API Routes 5개
- DynamoDB 연동

### 4. Verification Stack
- Verification Lambda 함수 5개
- API Routes 5개
- S3 업로드 연동

### 5. Cheer Stack
- Cheer Lambda 함수 7개
- API Routes 7개
- EventBridge 스케줄러

### 6. Admin Stack
- Admin Lambda 함수 6개
- API Routes 6개
- 관리자 권한 체크

---

## 📝 다음 파일

- **Part 3/3:** Frontend & Admin 주요 코드

---

## 💾 전체 코드 다운로드

모든 스택 코드는 `infra-cdk.zip` 파일에 포함되어 있습니다:
- core-stack.ts
- auth-stack.ts
- challenge-stack.ts
- verification-stack.ts
- cheer-stack.ts
- admin-stack.ts
- config 파일들
- CDK 설정 파일들
