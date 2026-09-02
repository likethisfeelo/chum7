/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_AWS_REGION: string;
  readonly VITE_COGNITO_USER_POOL_ID: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
  readonly VITE_S3_STATIC_BUCKET: string;
  readonly VITE_S3_UPLOADS_BUCKET: string;
  readonly VITE_CLOUDFRONT_URL: string;
  readonly VITE_APP_STAGE: string;
  readonly VITE_ENABLE_DEV_TOOLS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** vite.config.ts define — 빌드 시각 기반 버전 문자열 (배포 반영 확인용) */
declare const __BUILD_VERSION__: string;
