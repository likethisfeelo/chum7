/**
 * 스테이지 설정 — 유일한 진실 원천 (REDESIGN_PLAN §3.4).
 * 규칙:
 *  - 계정/리전 리터럴 금지 (CDK_DEFAULT_ACCOUNT/REGION 프로파일 사용)
 *  - 산출값(배포 ID 등) 기재 금지 — CfnOutput → 배포 스크립트가 소비
 *  - synth 시 process.env 분기 금지 — 모든 스테이지 차이는 이 파일에만 존재
 */
export interface StageConfig {
  stage: 'dev' | 'prod';
  isProd: boolean;
  /** 리소스 이름 프리픽스: chme2-<stage> */
  prefix: string;
  /**
   * 커스텀 도메인 설정. 미설정이면 CloudFront/API Gateway 기본 도메인으로 동작한다
   * (DNS 전환은 Phase 5 — 그 전까지 기본 도메인으로 병행 검증).
   */
  domain?: {
    /** Route53 호스티드 존 이름 (기존 계정 자산 — lookup으로만 참조) */
    zoneName: string;
    app: string;
    api: string;
    admin: string;
  };
  cors: {
    allowOrigins: string[];
  };
  /** 운영 알람 수신 이메일 (미설정 시 SNS 토픽만 생성) */
  opsAlertEmail?: string;
  /** 플랫폼 수수료율 (정산 v0 — PAYMENT_SPEC §6.1, 기본 5%) */
  platformFeeRate: number;
  /** 관계 아카이브 전체 콘텐츠(단계 E) 글로벌 스위치 — 기본 off, 검증 후 점진 오픈 */
  archiveFullContentEnabled?: boolean;
  /** 친구 기능 글로벌 스위치 — 기본 off(순차 출시) */
  friendsEnabled?: boolean;
  /** 친구 자격 임계값 — 각 방향 상호작용 수(초기 100, 조정 가능) */
  friendEligibilityThreshold?: number;
  /**
   * 소셜 로그인(Google/Kakao) — Cognito Hosted UI 팝업 방식.
   * 미설정이면 소셜 로그인 비활성(이메일/비밀번호만). google/kakao 개별 플래그는
   * 각 콘솔 앱 등록 + `npm run ops:set-oauth`로 시크릿 주입을 마친 뒤 켠다.
   * (플래그가 off면 해당 IdP 자체를 생성하지 않아, 시크릿 없이도 안전하게 배포된다.)
   */
  socialLogin?: {
    /** Hosted UI 도메인 프리픽스 → <prefix>.auth.<region>.amazoncognito.com (리전 내 전역 유니크) */
    domainPrefix: string;
    /** OAuth 콜백 URL (프론트 /auth/callback). 팝업이 이 URL로 복귀 — Cognito에 정확히 일치해야 함 */
    callbackUrls: string[];
    /** 로그아웃 복귀 URL */
    logoutUrls: string[];
    /** Google IdP 활성화 (콘솔 등록 + 시크릿 주입 후 true) */
    google?: boolean;
    /** Kakao IdP(OIDC) 활성화 (콘솔 등록 + 시크릿 주입 후 true) */
    kakao?: boolean;
  };
}

const dev: StageConfig = {
  stage: 'dev',
  isProd: false,
  prefix: 'chme2-dev',
  // Phase 5 전환 시 활성화: { zoneName: 'chum7.com', app: 'test.chum7.com', api: 'dev-api.chum7.com', admin: 'dev-admin.chum7.com' }
  domain: undefined,
  cors: { allowOrigins: ['*'] },
  platformFeeRate: 0.05,
  // 소셜 로그인 배관은 항상 생성(도메인+OAuth 클라이언트+시크릿 셸).
  // IdP는 google/kakao 플래그가 켜져야 생성됨 — 콘솔 등록+시크릿 주입 전까지 off 유지.
  // dev 배포 URL(CloudFront 기본 도메인)로 테스트하려면 그 origin의 /auth/callback을 callbackUrls에 추가한다.
  socialLogin: {
    domainPrefix: 'chme2-dev-auth',
    callbackUrls: ['http://localhost:5173/auth/callback'],
    logoutUrls: ['http://localhost:5173/login'],
    google: false,
    kakao: false,
  },
};

const prod: StageConfig = {
  stage: 'prod',
  isProd: true,
  prefix: 'chme2-prod',
  // Phase 5 DNS 컷오버 활성화 — 이 배포가 www/admin/api.chum7.com을 신규 시스템으로 전환한다.
  domain: {
    zoneName: 'chum7.com',
    app: 'www.chum7.com',
    api: 'api.chum7.com',
    admin: 'admin.chum7.com',
  },
  cors: { allowOrigins: ['https://www.chum7.com', 'https://admin.chum7.com'] },
  platformFeeRate: 0.05,
  socialLogin: {
    domainPrefix: 'chme2-prod-auth',
    callbackUrls: ['https://www.chum7.com/auth/callback'],
    logoutUrls: ['https://www.chum7.com/login'],
    google: false,
    kakao: false,
  },
};

export function resolveStageConfig(stage: string): StageConfig {
  if (stage === 'prod') return prod;
  if (stage === 'dev') return dev;
  throw new Error(`Unknown stage: ${stage} (dev | prod)`);
}
