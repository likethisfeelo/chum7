// infra/stacks/core-stack.ts (Cognito 부분 수정)
import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { 
  UserPool, 
  UserPoolClient, 
  CfnUserPoolGroup,
  AccountRecovery,
  VerificationEmailStyle 
} from 'aws-cdk-lib/aws-cognito';

export class CoreStack extends Stack {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: CoreStackProps) {
    super(scope, id, props);

    const { stage } = props;

    // User Pool
    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: `chme-${stage}-users`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      userVerification: {
        emailSubject: 'CHME 인증 코드',
        emailBody: '인증 코드: {####}',
        emailStyle: VerificationEmailStyle.CODE,
      },
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // User Pool Client
    this.userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `chme-${stage}-client`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(7),
    });

    // ==================== Admin 그룹 생성 ====================
    const adminsGroup = new CfnUserPoolGroup(this, 'AdminsGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admins',
      description: 'CHME 관리자 그룹',
      precedence: 0, // 가장 높은 우선순위
    });

    // Outputs
    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `${stage}-user-pool-id`,
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: `${stage}-user-pool-client-id`,
    });

    new CfnOutput(this, 'AdminsGroupName', {
      value: adminsGroup.groupName!,
      exportName: `${stage}-admins-group-name`,
    });
  }
}

// infra/bin/chme.ts (업데이트 - Admin Stack 추가)
import { App } from 'aws-cdk-lib';
import { CoreStack } from '../stacks/core-stack';
import { AuthStack } from '../stacks/auth-stack';
import { ChallengeStack } from '../stacks/challenge-stack';
import { VerificationStack } from '../stacks/verification-stack';
import { CheerStack } from '../stacks/cheer-stack';
import { AdminStack } from '../stacks/admin-stack'; // 추가
import { devConfig } from '../config/dev';
import { prodConfig } from '../config/prod';

const app = new App();
const stage = app.node.tryGetContext('stage') || 'dev';
const config = stage === 'prod' ? prodConfig : devConfig;

// Core Stack
const coreStack = new CoreStack(app, `chme-${stage}-core`, {
  env: { account: config.account, region: config.region },
  stage,
  config,
});

// Auth Stack
const authStack = new AuthStack(app, `chme-${stage}-auth`, {
  env: { account: config.account, region: config.region },
  stage,
  apiGateway: coreStack.apiGateway,
  userPool: coreStack.userPool,
  usersTable: coreStack.usersTable,
});

// Challenge Stack
const challengeStack = new ChallengeStack(app, `chme-${stage}-challenge`, {
  env: { account: config.account, region: config.region },
  stage,
  apiGateway: coreStack.apiGateway,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
});

// Verification Stack
const verificationStack = new VerificationStack(app, `chme-${stage}-verification`, {
  env: { account: config.account, region: config.region },
  stage,
  apiGateway: coreStack.apiGateway,
  verificationsTable: coreStack.verificationsTable,
  userChallengesTable: coreStack.userChallengesTable,
  uploadsBucket: coreStack.uploadsBucket,
});

// Cheer Stack
const cheerStack = new CheerStack(app, `chme-${stage}-cheer`, {
  env: { account: config.account, region: config.region },
  stage,
  apiGateway: coreStack.apiGateway,
  cheersTable: coreStack.cheersTable,
  userCheerTicketsTable: coreStack.userCheerTicketsTable,
  snsTopic: coreStack.snsTopic,
  eventBus: coreStack.eventBus,
});

// ==================== Admin Stack 추가 ====================
const adminStack = new AdminStack(app, `chme-${stage}-admin`, {
  env: { account: config.account, region: config.region },
  stage,
  apiGateway: coreStack.apiGateway,
  userPool: coreStack.userPool,
  usersTable: coreStack.usersTable,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
});

// Dependencies
authStack.addDependency(coreStack);
challengeStack.addDependency(coreStack);
verificationStack.addDependency(coreStack);
cheerStack.addDependency(coreStack);
adminStack.addDependency(coreStack); // 추가

app.synth();

// 관리자 사용자 생성 스크립트
// scripts/create-admin-user.sh
#!/bin/bash

# 환경 변수
STAGE=${1:-dev}
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name chme-${STAGE}-core \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

EMAIL=$2
TEMP_PASSWORD=$3

if [ -z "$EMAIL" ] || [ -z "$TEMP_PASSWORD" ]; then
  echo "사용법: ./create-admin-user.sh [stage] [email] [temp-password]"
  echo "예시: ./create-admin-user.sh dev admin@chme.app TempPass123!"
  exit 1
fi

echo "관리자 사용자 생성 중..."
echo "User Pool ID: $USER_POOL_ID"
echo "Email: $EMAIL"

# 1. 사용자 생성
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username $EMAIL \
  --user-attributes Name=email,Value=$EMAIL Name=email_verified,Value=true \
  --temporary-password $TEMP_PASSWORD \
  --message-action SUPPRESS

# 2. admins 그룹에 추가
aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username $EMAIL \
  --group-name admins

# 3. 비밀번호 영구 설정 (선택)
# aws cognito-idp admin-set-user-password \
#   --user-pool-id $USER_POOL_ID \
#   --username $EMAIL \
#   --password $TEMP_PASSWORD \
#   --permanent

echo "✅ 관리자 사용자 생성 완료!"
echo "이메일: $EMAIL"
echo "임시 비밀번호: $TEMP_PASSWORD"
echo "첫 로그인 시 비밀번호 변경이 필요합니다."

# PowerShell 버전
# scripts/create-admin-user.ps1
param(
    [Parameter(Mandatory=$true)]
    [string]$Stage,
    
    [Parameter(Mandatory=$true)]
    [string]$Email,
    
    [Parameter(Mandatory=$true)]
    [string]$TempPassword
)

Write-Host "관리자 사용자 생성 중..." -ForegroundColor Green

# User Pool ID 가져오기
$UserPoolId = aws cloudformation describe-stacks `
  --stack-name "chme-$Stage-core" `
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' `
  --output text

Write-Host "User Pool ID: $UserPoolId"
Write-Host "Email: $Email"

# 1. 사용자 생성
aws cognito-idp admin-create-user `
  --user-pool-id $UserPoolId `
  --username $Email `
  --user-attributes Name=email,Value=$Email Name=email_verified,Value=true `
  --temporary-password $TempPassword `
  --message-action SUPPRESS

# 2. admins 그룹에 추가
aws cognito-idp admin-add-user-to-group `
  --user-pool-id $UserPoolId `
  --username $Email `
  --group-name admins

Write-Host "✅ 관리자 사용자 생성 완료!" -ForegroundColor Green
Write-Host "이메일: $Email"
Write-Host "임시 비밀번호: $TempPassword"
Write-Host "첫 로그인 시 비밀번호 변경이 필요합니다." -ForegroundColor Yellow
