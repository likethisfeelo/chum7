/**
 * Frontend Stack
 *
 * 유저 프론트엔드: 기존 S3 버킷 + CloudFront import → 파일 배포 + 캐시 무효화
 * 어드민 프론트엔드: 신규 S3 버킷 + CloudFront 생성 → 파일 배포
 *
 * 배포 전 빌드 필수:
 *   cd frontend       && npm run build   → frontend/dist/
 *   cd admin-frontend && npm run build   → admin-frontend/dist/
 */
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
interface FrontendStackProps extends StackProps {
    stage: string;
    config: any;
}
export declare class FrontendStack extends Stack {
    constructor(scope: Construct, id: string, props: FrontendStackProps);
}
export {};
