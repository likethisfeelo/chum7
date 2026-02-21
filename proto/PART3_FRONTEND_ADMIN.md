# CHME 프로젝트 전체 코드 모음 (Part 3/3)
## Frontend & Admin 주요 코드

---

## 📦 Frontend 폴더 구조

```
frontend/
├── public/
│   └── index.html
├── src/
│   ├── app/
│   │   └── App.tsx
│   ├── features/
│   │   ├── auth/
│   │   │   └── pages/
│   │   │       └── LoginPage.tsx
│   │   ├── challenge/
│   │   │   └── pages/
│   │   │       └── ChallengesPage.tsx
│   │   ├── verification/
│   │   │   └── components/
│   │   │       └── VerificationSheet.tsx
│   │   ├── cheer/
│   │   │   └── components/
│   │   │       └── CheerOpportunityPopup.tsx
│   │   ├── me/
│   │   │   └── pages/
│   │   │       └── MEPage.tsx
│   │   └── today/
│   │       └── pages/
│   │           └── TodayPage.tsx
│   ├── shared/
│   │   ├── components/
│   │   │   └── BottomNav.tsx
│   │   ├── layouts/
│   │   │   └── MainLayout.tsx
│   │   └── lib/
│   │       └── api-client.ts
│   └── stores/
│       └── authStore.ts
├── .env.dev
├── .env.prod
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## 📄 Frontend .env.dev

```env
VITE_API_URL=https://api.chum7.com
VITE_API_STAGE=dev

VITE_AWS_REGION=ap-northeast-2
VITE_COGNITO_USER_POOL_ID=ap-northeast-2_NCbbx3Ilm
VITE_COGNITO_CLIENT_ID=6aalogssb8bb70rtg63a2l7jdb

VITE_S3_UPLOADS_BUCKET=chum7-dev-uploads
VITE_CLOUDFRONT_UPLOADS_URL=https://d123456.cloudfront.net

VITE_APP_NAME=CHME
VITE_APP_URL=https://test.chum7.com
```

---

## 📄 Frontend .env.prod

```env
VITE_API_URL=https://api.chum7.com
VITE_API_STAGE=prod

VITE_AWS_REGION=ap-northeast-2
VITE_COGNITO_USER_POOL_ID=ap-northeast-2_n8ZjUpupj
VITE_COGNITO_CLIENT_ID=5d62qaq228fap818m8gi8jt759

VITE_S3_UPLOADS_BUCKET=chum7-prod-uploads
VITE_CLOUDFRONT_UPLOADS_URL=https://d789012.cloudfront.net

VITE_APP_NAME=CHME
VITE_APP_URL=https://www.chum7.com
```

---

## 📄 Frontend package.json

```json
{
  "name": "chme-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --mode dev",
    "build:dev": "tsc && vite build --mode dev",
    "build:prod": "tsc && vite build --mode prod",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "zustand": "^4.4.7",
    "@tanstack/react-query": "^5.14.0",
    "axios": "^1.6.2",
    "framer-motion": "^10.16.5",
    "react-icons": "^4.12.0",
    "date-fns": "^2.30.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@typescript-eslint/eslint-plugin": "^6.14.0",
    "@typescript-eslint/parser": "^6.14.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.55.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.3.6",
    "typescript": "^5.2.2",
    "vite": "^5.0.8"
  }
}
```

---

## 📄 Frontend vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

---

## 📄 Frontend tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Chakra 컬러 시스템
        chakra: {
          red: '#FF6B6B',
          orange: '#FFA94D',
          yellow: '#FFD93D',
          green: '#6BCF7F',
          blue: '#4ECDC4',
          indigo: '#A8DADC',
          violet: '#B4A7D6',
        },
        // 브랜드 컬러
        primary: '#FFA94D',
        secondary: '#4ECDC4',
        accent: '#FF6B6B',
      },
      fontFamily: {
        sans: ['Pretendard', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

---

## 📦 Admin 폴더 구조

```
admin/
├── public/
│   └── index.html
├── src/
│   ├── app/
│   │   └── App.tsx
│   ├── features/
│   │   ├── challenge/
│   │   │   ├── components/
│   │   │   │   ├── ChallengeForm.tsx
│   │   │   │   └── ChallengeList.tsx
│   │   │   └── pages/
│   │   │       └── ChallengesPage.tsx
│   │   ├── user/
│   │   │   └── pages/
│   │   │       └── UsersPage.tsx
│   │   └── dashboard/
│   │       └── pages/
│   │           └── DashboardPage.tsx
│   ├── shared/
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   └── lib/
│   │       └── api-client.ts
│   └── stores/
│       └── authStore.ts
├── .env.dev
├── .env.prod
├── package.json
└── vite.config.ts
```

---

## 📄 Admin .env.dev

```env
VITE_API_URL=https://api.chum7.com
VITE_API_STAGE=dev

VITE_AWS_REGION=ap-northeast-2
VITE_COGNITO_USER_POOL_ID=ap-northeast-2_NCbbx3Ilm
VITE_COGNITO_CLIENT_ID=6aalogssb8bb70rtg63a2l7jdb

VITE_APP_NAME=CHME Admin
VITE_APP_URL=https://admin.chum7.com
```

---

## 📄 Admin .env.prod

```env
VITE_API_URL=https://api.chum7.com
VITE_API_STAGE=prod

VITE_AWS_REGION=ap-northeast-2
VITE_COGNITO_USER_POOL_ID=ap-northeast-2_n8ZjUpupj
VITE_COGNITO_CLIENT_ID=5d62qaq228fap818m8gi8jt759

VITE_APP_NAME=CHME Admin
VITE_APP_URL=https://admin.chum7.com
```

---

## 🚀 빌드 & 배포

### Frontend 빌드
```bash
cd frontend

# DEV 빌드
npm run build:dev

# PROD 빌드
npm run build:prod

# S3 업로드 (DEV)
aws s3 sync dist/ s3://chme-dev/ --delete

# CloudFront 캐시 무효화
aws cloudfront create-invalidation --distribution-id ESKW3DS5HUUK9 --paths "/*"
```

### Admin 빌드
```bash
cd admin

# DEV 빌드
npm run build:dev

# PROD 빌드
npm run build:prod

# S3 업로드
aws s3 sync dist/ s3://admin-chum7-com/ --delete
```

---

## 📋 주요 페이지 설명

### Frontend (사용자 앱)

#### 1. LoginPage
- 이메일/비밀번호 로그인
- Cognito 연동
- 소셜 로그인 (구글, 카카오)

#### 2. ChallengesPage
- 챌린지 목록 (카테고리별)
- 검색 및 필터
- 챌린지 참여

#### 3. MEPage (핵심!)
- 인증하기 (하단 시트)
- 응원권 사용
- Day 6 보완

#### 4. TodayPage
- 오늘의 진행 현황
- 받은 응원 확인
- 정체성 선언

#### 5. VerificationSheet
- 사진 업로드
- 소감 작성
- 델타 계산
- 응원 기회 감지

#### 6. CheerOpportunityPopup
- 즉시 응원 발송
- 응원 메시지 선택
- 응원권 생성 알림

---

### Admin (관리자 앱)

#### 1. DashboardPage
- 전체 통계 요약
- 사용자 수, 챌린지 수
- 완료율, 응원 통계

#### 2. ChallengesPage
- 챌린지 생성/수정/삭제
- 활성화/비활성화
- 통계 확인

#### 3. UsersPage
- 사용자 목록
- 검색 및 필터
- 사용자 상세 정보

---

## 🎨 디자인 시스템

### 컬러 팔레트
```
Chakra Colors (챌린지 카테고리별):
- Red (#FF6B6B): 건강
- Orange (#FFA94D): 습관
- Yellow (#FFD93D): 자기계발
- Green (#6BCF7F): 창의성
- Blue (#4ECDC4): 관계
- Indigo (#A8DADC): 마음챙김
- Violet (#B4A7D6): 기타

Primary: #FFA94D (Peach Cream Orange)
Secondary: #4ECDC4 (Turquoise)
Accent: #FF6B6B (Coral Red)
```

### 타이포그래피
```
Font Family: Pretendard
Headings: 24px, 20px, 18px, 16px
Body: 14px
Caption: 12px
```

### 애니메이션
```
- Framer Motion 사용
- 페이지 전환: Slide, Fade
- 완료 축하: Confetti, Scale
- 응원 발송: Heart particles
```

---

## 📱 반응형 디자인

### Breakpoints
```
Mobile: < 768px
Tablet: 768px - 1024px
Desktop: > 1024px
```

### 하단 네비게이션
```
모바일: 5개 탭 (고정)
- 챌린지 🎯
- 어스 🌍
- ME ● (중앙 돌출)
- 투데이 📊
- 애셋 💎
```

---

## 🔐 인증 흐름

### 로그인
```
1. 이메일/비밀번호 입력
2. Cognito 인증
3. JWT 토큰 발급 (Access + Refresh)
4. Zustand 스토어 저장
5. 로컬스토리지 저장
6. 홈으로 리다이렉트
```

### API 요청
```
1. Axios Interceptor
2. Authorization Header 추가
3. 401 에러 → Refresh Token
4. 토큰 갱신 실패 → 로그아웃
```

---

## 💾 전체 코드 다운로드

### ZIP 파일 목록

1. **lambda-codes.zip** (48KB)
   - 28개 Lambda 함수 코드 (.ts 파일)

2. **infra-cdk.zip** (31KB)
   - 6개 CDK 스택
   - Config 파일들
   - CDK 설정 파일들

3. **frontend-all.zip** (40KB)
   - Frontend 주요 컴포넌트
   - Admin Frontend 주요 컴포넌트
   - 환경 설정 파일들
   - package.json, vite.config 등

4. **guides-docs.zip** (71KB)
   - 배포 가이드
   - Lambda 생성 명령어
   - 프로젝트 문서
   - 체크리스트

---

## 🎯 배포 체크리스트

### 1. AWS 리소스 생성 (콘솔)
- [ ] DynamoDB 테이블 6개
- [ ] S3 Buckets 4개
- [ ] CloudFront Distributions 2개
- [ ] Cognito User Pools 2개
- [ ] Lambda Role (chum7_lambda_first)

### 2. Lambda 배포
- [ ] Auth Lambda 5개
- [ ] Challenge Lambda 5개
- [ ] Verification Lambda 5개
- [ ] Cheer Lambda 7개
- [ ] Admin Lambda 6개

### 3. Frontend 배포
- [ ] Frontend 빌드 → S3 업로드
- [ ] Admin 빌드 → S3 업로드
- [ ] CloudFront 캐시 무효화

### 4. 테스트
- [ ] 회원가입/로그인
- [ ] 챌린지 참여
- [ ] 인증 제출
- [ ] 응원 발송
- [ ] 관리자 기능

---

## 🎉 완료!

모든 코드와 가이드가 준비되었습니다!

**다운로드한 ZIP 파일:**
1. lambda-codes.zip
2. infra-cdk.zip
3. frontend-all.zip
4. guides-docs.zip

**MD 문서:**
1. PART1_PROJECT_OVERVIEW.md (이 문서)
2. PART2_CDK_INFRASTRUCTURE.md
3. PART3_FRONTEND_ADMIN.md (이 파일)

---

## 📞 참고

프로젝트 구조, Lambda 배포, CDK 배포, Frontend 배포 등 모든 과정이
ZIP 파일과 MD 문서에 포함되어 있습니다!
