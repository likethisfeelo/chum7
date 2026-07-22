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
}

const dev: StageConfig = {
  stage: 'dev',
  isProd: false,
  prefix: 'chme2-dev',
  // Phase 5 전환 시 활성화: { zoneName: 'chum7.com', app: 'test.chum7.com', api: 'dev-api.chum7.com', admin: 'dev-admin.chum7.com' }
  domain: undefined,
  cors: { allowOrigins: ['*'] },
  platformFeeRate: 0.05,
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
};

export function resolveStageConfig(stage: string): StageConfig {
  if (stage === 'prod') return prod;
  if (stage === 'dev') return dev;
  throw new Error(`Unknown stage: ${stage} (dev | prod)`);
}
