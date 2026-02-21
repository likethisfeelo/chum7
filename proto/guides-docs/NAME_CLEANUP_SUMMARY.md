# CHME → CHUM7 이름 정리 완료 ✅

## 🔍 발견된 문제

### 1. 프로젝트 이름 혼재
- **옛날 이름**: `chme` (Challenge ME)
- **현재 이름**: `chum7` (Challenge Us with ME → chum7.com)

### 2. 리소스 이름이 섞여있음

| 리소스 | 실제 이름 | 비고 |
|--------|----------|------|
| **Cognito User Pool (DEV)** | `chum7-dev-users` | ✅ 올바름 |
| **Cognito User Pool (PROD)** | `chum7-prod-users` | ✅ 올바름 |
| **App Client (DEV)** | `chum7-dev-users` | ✅ 올바름 |
| **App Client (PROD)** | `chum-prod-users` | ⚠️ 7 빠짐 (괜찮음, ID만 중요) |
| **S3 Static (DEV)** | `chme-dev` | ⚠️ 옛날 이름 (그대로 사용) |
| **S3 Static (PROD)** | `chme-prod-static` | ⚠️ 옛날 이름 (그대로 사용) |
| **S3 Uploads (DEV)** | `chum7-dev-uploads` | ✅ 올바름 |
| **S3 Uploads (PROD)** | `chum7-prod-uploads` | ✅ 올바름 |

---

## ✅ 수정 완료 (6개 파일)

### 1. Frontend 환경 변수 (2개)
```
frontend/.env.dev     ← frontend-env-dev-fixed.txt
frontend/.env.prod    ← frontend-env-prod-fixed.txt
```

### 2. Admin Frontend 환경 변수 (2개)
```
admin-frontend/.env.dev     ← admin-frontend-env-dev-fixed.txt
admin-frontend/.env.prod    ← admin-frontend-env-prod-fixed.txt
```

### 3. Infra Config 파일 (2개)
```
infra/config/dev.ts     ← config-dev-fixed.ts
infra/config/prod.ts    ← config-prod-fixed.ts
```

---

## 📋 최종 확정된 값

### DEV 환경
```
API URL:        https://dev.chum7.com
CloudFront:     https://test.chum7.com
Distribution:   ESKW3DS5HUUK9

Cognito Pool:   chum7-dev-users (ap-northeast-2_NCbbx3Ilm)
Client ID:      6aalogssb8bb70rtg63a2l7jdb

S3 Static:      chme-dev (기존 버킷 그대로)
S3 Uploads:     chum7-dev-uploads
```

### PROD 환경
```
API URL:        https://api.chum7.com
CloudFront:     https://www.chum7.com
Distribution:   EUM1ULUXR9NQZ

Cognito Pool:   chum7-prod-users (ap-northeast-2_n8ZjUpupj)
Client ID:      5d62qaq228fap818m8gi8jt759

S3 Static:      chme-prod-static (기존 버킷 그대로)
S3 Uploads:     chum7-prod-uploads
```

---

## ⚠️ S3 버킷 이름이 섞인 이유

**이미 만들어진 버킷은 이름 변경 불가능합니다.**

- `chme-dev`, `chme-prod-static`는 이미 있는 버킷
- 삭제 후 재생성하면 데이터 손실
- **그대로 사용하는 게 안전함**

---

## 🎯 할 일

### 1. 파일 복사 (6개)
```bash
# Frontend
frontend/.env.dev
frontend/.env.prod

# Admin Frontend  
admin-frontend/.env.dev
admin-frontend/.env.prod

# Infra Config
infra/config/dev.ts
infra/config/prod.ts
```

### 2. Cognito Callback URL 설정 (AWS Console)

**DEV (chum7-dev-users):**
```
https://test.chum7.com/callback
http://localhost:5173/callback
http://localhost:5174/callback
```

**PROD (chum7-prod-users):**
```
https://www.chum7.com/callback
https://admin.chum7.com/callback
```

### 3. Bootstrap & Deploy
```bash
# Bootstrap (최초 1회)
cdk bootstrap aws://532393804562/ap-northeast-2

# DEV 배포
.\scripts\deploy-dev.ps1

# PROD 배포
.\scripts\deploy-prod.ps1
```

---

## ✨ 정리 완료!

**모든 파일이 실제 AWS 리소스 이름과 일치하도록 수정되었습니다.**

복붙만 하면 끝입니다! 🚀
