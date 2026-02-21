# CHME Frontend 완전 구축 가이드

## 📋 프론트엔드 구조

```
frontend/
├── public/
│   ├── manifest.json           # PWA 매니페스트
│   └── icons/                  # 앱 아이콘들
│
├── src/
│   ├── app/
│   │   ├── App.tsx            # 메인 앱
│   │   ├── routes.tsx         # 라우팅 설정
│   │   └── providers.tsx      # Provider 통합
│   │
│   ├── features/              # 기능별 모듈
│   │   ├── auth/             # 인증
│   │   ├── challenge/        # 챌린지
│   │   ├── verification/     # 인증
│   │   ├── cheer/            # 응원
│   │   ├── feed/             # 피드
│   │   └── profile/          # 프로필
│   │
│   ├── shared/               # 공통 모듈
│   │   ├── components/       # 공통 컴포넌트
│   │   ├── layouts/          # 레이아웃
│   │   ├── hooks/            # 공통 훅
│   │   ├── utils/            # 유틸리티
│   │   └── types/            # 공통 타입
│   │
│   ├── lib/                  # 외부 라이브러리 설정
│   │   ├── api-client.ts     # Axios 설정
│   │   ├── cognito.ts        # Cognito 설정
│   │   └── query-client.ts   # React Query 설정
│   │
│   └── styles/
│       ├── index.css         # Tailwind + Global
│       └── animations.css    # 애니메이션
│
├── .env.dev
├── .env.prod
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## 📦 필요한 패키지

### package.json
```json
{
  "name": "chme-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "build:dev": "tsc && vite build --mode development",
    "build:prod": "tsc && vite build --mode production",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.22.0",
    
    "@tanstack/react-query": "^5.17.19",
    "axios": "^1.6.5",
    "zustand": "^4.5.0",
    
    "aws-amplify": "^6.0.12",
    "@aws-sdk/client-cognito-identity-provider": "^3.504.0",
    
    "framer-motion": "^11.0.3",
    "react-icons": "^5.0.1",
    
    "zod": "^3.22.4",
    "date-fns": "^3.3.1",
    "clsx": "^2.1.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "@typescript-eslint/eslint-plugin": "^6.19.0",
    "@typescript-eslint/parser": "^6.19.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "eslint": "^8.56.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.11",
    "vite-plugin-pwa": "^0.17.5"
  }
}
```

### vite.config.ts
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CHME - Challenge Earth with ME',
        short_name: 'CHME',
        description: '7일간의 짧고 강렬한 챌린지 플랫폼',
        theme_color: '#FF9B71',
        background_color: '#FFFFFF',
        display: 'standalone',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    open: true
  }
});
```

### tailwind.config.js
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
        // Peach Cream Orange Pastel 컬러 시스템
        primary: {
          50: '#FFF5F0',
          100: '#FFE8DC',
          200: '#FFD1B9',
          300: '#FFBA96',
          400: '#FFA373',
          500: '#FF9B71', // 메인 컬러
          600: '#FF7C4D',
          700: '#FF5D29',
          800: '#E64D1F',
          900: '#CC4419',
        },
        secondary: {
          50: '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
          700: '#0369A1',
          800: '#075985',
          900: '#0C4A6E',
        },
        // 카테고리별 색상 (Chakra)
        health: '#FF6B6B',      // 건강 - 빨강
        habit: '#4ECDC4',       // 습관 - 청록
        development: '#45B7D1', // 자기계발 - 파랑
        creativity: '#FFA07A',  // 창의성 - 주황
        relationship: '#98D8C8', // 관계 - 민트
        mindfulness: '#B19CD9', // 마음챙김 - 보라
      },
      fontFamily: {
        sans: ['Pretendard', 'system-ui', 'sans-serif'],
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    /* Path mapping */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

## 🎨 5개 탭 구조

기획서에 따른 탭 순서:
1. **챌린지** 🎯 - 챌린지 탐색 & 참여
2. **어스** 🌍 - 커뮤니티 피드
3. **ME** ● - 인증/응원 (중앙 돌출 버튼)
4. **투데이** 📊 - 오늘의 대시보드
5. **애셋** 💎 - 마이페이지 (정체성 자산)

## 📱 주요 화면

### 필수 화면 (30개+)

**Auth (3개)**
- LoginPage
- RegisterPage
- OnboardingPage

**Challenge (5개)**
- ChallengesPage (탭 1)
- ChallengeDetailPage
- ChallengeJoinPage
- MyChallengesPage
- ChallengeStatsPage

**Verification (4개)**
- VerificationPage (ME 탭)
- VerificationCompletePage
- RemedyPage (Day 6)
- VerificationHistoryPage

**Cheer (5개)**
- CheerOpportunityPopup
- CheerMessageSelectSheet
- CheerTicketUsePage
- ScheduledCheersPage
- ReceivedCheersPage

**Feed (2개)**
- FeedPage (탭 2 - 어스)
- YesterdayHeroesPage

**Today (1개)**
- TodayPage (탭 4)

**Profile (3개)**
- ProfilePage (탭 5 - 애셋)
- ProfileEditPage
- BadgeCollectionPage

## 🚀 개발 시작

```bash
# 1. 프로젝트 초기화
cd frontend
npm install

# 2. 개발 서버 실행
npm run dev

# 3. 빌드
npm run build:dev   # DEV
npm run build:prod  # PROD
```

---

**다음: 핵심 컴포넌트 및 페이지 생성**
