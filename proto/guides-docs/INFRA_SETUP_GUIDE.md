# CHME Infra 파일 배치 가이드

## 📂 파일 구조

```
C:\chum7\
└── infra/
    ├── bin/
    │   └── chme.ts              ← chme.ts 복사
    │
    ├── config/
    │   ├── dev.ts               ← config-dev-fixed.ts (이미 있음)
    │   └── prod.ts              ← config-prod-fixed.ts (이미 있음)
    │
    ├── stacks/
    │   ├── core-stack.ts        (생성 예정)
    │   ├── auth-stack.ts        (생성 예정)
    │   ├── challenge-stack.ts   (생성 예정)
    │   ├── verification-stack.ts (생성 예정)
    │   ├── cheer-stack.ts       (생성 예정)
    │   └── admin-stack.ts       (생성 예정)
    │
    ├── cdk.json                 ← cdk.json 복사
    ├── package.json             ← package-json-infra.txt 복사
    ├── tsconfig.json            ← tsconfig-infra.json 복사
    └── .gitignore
```

---

## 📋 복사할 파일 (4개)

### 1. bin/chme.ts
```
파일: chme.ts
위치: infra/bin/chme.ts
설명: 모든 스택을 정의하는 메인 진입점
```

### 2. cdk.json
```
파일: cdk.json
위치: infra/cdk.json
설명: CDK 설정 (app: "bin/chme.ts" 포함)
```

### 3. package.json
```
파일: package-json-infra.txt
위치: infra/package.json
설명: NPM 의존성 및 스크립트
```

### 4. tsconfig.json
```
파일: tsconfig-infra.json
위치: infra/tsconfig.json
설명: TypeScript 컴파일러 설정
```

---

## 🎯 주요 특징

### chme.ts (그대로 유지)
- ✅ 파일명: `chme.ts` (변경 안 함)
- ✅ Context로 stage 분리 (`--context stage=dev/prod`)
- ✅ 6개 스택 정의:
  - chme-dev-core / chme-prod-core
  - chme-dev-auth / chme-prod-auth
  - chme-dev-challenge / chme-prod-challenge
  - chme-dev-verification / chme-prod-verification
  - chme-dev-cheer / chme-prod-cheer
  - chme-dev-admin / chme-prod-admin

### cdk.json (그대로 유지)
- ✅ App 진입점: `"npx ts-node --prefer-ts-exts bin/chme.ts"`
- ✅ 최신 CDK feature flags 포함

### package.json
- ✅ CDK v2.117.0
- ✅ TypeScript 5.3
- ✅ 편리한 스크립트:
  ```bash
  npm run deploy:dev   # DEV 전체 배포
  npm run deploy:prod  # PROD 전체 배포
  npm run diff:dev     # DEV 변경사항 확인
  npm run synth:dev    # DEV CloudFormation 템플릿 생성
  ```

---

## 🚀 사용 방법

### 1. 파일 복사
```powershell
# bin 폴더가 없으면 생성
cd C:\chum7\infra
mkdir bin

# 4개 파일 복사
# chme.ts → infra/bin/chme.ts
# cdk.json → infra/cdk.json
# package-json-infra.txt → infra/package.json (이름 변경)
# tsconfig-infra.json → infra/tsconfig.json (이름 변경)
```

### 2. 의존성 설치
```powershell
cd C:\chum7\infra
npm install
```

### 3. Bootstrap
```powershell
cdk bootstrap aws://532393804562/ap-northeast-2
```

### 4. DEV 배포
```powershell
# 방법 1: npm 스크립트
npm run deploy:dev

# 방법 2: cdk 직접 실행
cdk deploy --all --context stage=dev

# 방법 3: PowerShell 스크립트 (생성 예정)
.\scripts\deploy-dev.ps1
```

### 5. PROD 배포
```powershell
npm run deploy:prod
# 또는
cdk deploy --all --context stage=prod
```

---

## 📊 배포되는 스택

### DEV 환경
```
✅ chme-dev-core          (API Gateway, Cognito, DynamoDB, S3)
✅ chme-dev-auth          (5개 Auth Lambda)
✅ chme-dev-challenge     (5개 Challenge Lambda)
✅ chme-dev-verification  (5개 Verification Lambda)
✅ chme-dev-cheer         (7개 Cheer Lambda)
✅ chme-dev-admin         (6개 Admin Lambda)
```

### PROD 환경
```
✅ chme-prod-core
✅ chme-prod-auth
✅ chme-prod-challenge
✅ chme-prod-verification
✅ chme-prod-cheer
✅ chme-prod-admin
```

---

## ⚠️ 주의사항

### 1. config 파일 확인
```typescript
// infra/config/dev.ts
export const devConfig = {
  account: '532393804562',  // ✅ 확인
  region: 'ap-northeast-2',
  // ...
};

// infra/config/prod.ts
export const prodConfig = {
  account: '532393804562',  // ✅ 확인
  region: 'ap-northeast-2',
  // ...
};
```

### 2. Stack 파일 생성 필요
`stacks/` 폴더에 6개 Stack 파일이 필요합니다:
- core-stack.ts
- auth-stack.ts
- challenge-stack.ts
- verification-stack.ts
- cheer-stack.ts
- admin-stack.ts

→ 이 파일들은 별도로 생성해야 합니다!

### 3. bin/chme.ts 실행 권한
Windows에서는 자동으로 처리되지만, 첫 줄의 shebang이 있습니다:
```typescript
#!/usr/bin/env node
```
→ 문제없이 작동합니다.

---

## ✅ 체크리스트

- [ ] `bin/chme.ts` 복사
- [ ] `cdk.json` 복사
- [ ] `package.json` 복사 (이름 변경)
- [ ] `tsconfig.json` 복사 (이름 변경)
- [ ] `config/dev.ts` 확인 (Account ID: 532393804562)
- [ ] `config/prod.ts` 확인 (Account ID: 532393804562)
- [ ] `npm install` 실행
- [ ] `cdk bootstrap` 실행
- [ ] Stack 파일들 생성 (6개)
- [ ] `npm run deploy:dev` 테스트

---

## 🎉 완료!

파일명 `chme.ts` 그대로 사용하면서도 AWS 리소스는 `chum7-*`로 생성됩니다!

**복붙만 하면 끝입니다!** 🚀
