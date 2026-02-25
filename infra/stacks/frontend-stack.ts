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
import {
  Stack,
  StackProps,
  CfnOutput,
  RemovalPolicy,
  Duration,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import {
  Distribution,
  ViewerProtocolPolicy,
  CachePolicy,
  AllowedMethods,
  ErrorResponse,
  SecurityPolicyProtocol,
  OriginAccessIdentity,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BucketDeployment, Source, CacheControl } from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';
import * as fs from 'fs';

interface FrontendStackProps extends StackProps {
  stage: string;
  config: any;
}

// React Router BrowserRouter 지원: 모든 404/403 → /index.html 200
const SPA_ERROR_RESPONSES: ErrorResponse[] = [
  {
    httpStatus: 403,
    responseHttpStatus: 200,
    responsePagePath: '/index.html',
    ttl: Duration.seconds(0),
  },
  {
    httpStatus: 404,
    responseHttpStatus: 200,
    responsePagePath: '/index.html',
    ttl: Duration.seconds(0),
  },
];

export class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { stage, config } = props;
    const isProd = stage === 'prod';

    // ================================================================
    // 유저 프론트엔드 — 기존 S3 버킷 + CloudFront import
    // ================================================================
    const userBucket = Bucket.fromBucketName(
      this,
      'UserStaticBucket',
      config.s3.staticBucket,
    );

    const userDistribution = Distribution.fromDistributionAttributes(
      this,
      'UserDistribution',
      {
        distributionId: config.cloudfront.distributionId,
        domainName:     config.domain.app,
      },
    );

    const userDistPath = path.join(__dirname, '../../frontend/dist');
    if (fs.existsSync(userDistPath)) {
      // index.html — no-cache (항상 최신 entrypoint 받도록)
      new BucketDeployment(this, 'UserFrontendIndexDeploy', {
        sources: [
          Source.asset(userDistPath, {
            exclude: ['**', '!index.html'],
          }),
        ],
        destinationBucket:  userBucket,
        distribution:       userDistribution,
        distributionPaths:  ['/index.html'],
        cacheControl:       [CacheControl.noCache()],
        prune:              false,
      });

      // SW 관련 파일 — no-cache (업데이트 가능해야 함)
      new BucketDeployment(this, 'UserFrontendSwDeploy', {
        sources: [
          Source.asset(userDistPath, {
            exclude: ['**', '!sw.js', '!registerSW.js', '!workbox-*.js', '!manifest.webmanifest', '!manifest.json'],
          }),
        ],
        destinationBucket:  userBucket,
        distribution:       userDistribution,
        distributionPaths:  ['/sw.js', '/registerSW.js', '/workbox-*.js', '/manifest.webmanifest', '/manifest.json'],
        cacheControl:       [CacheControl.noCache()],
        prune:              false,
      });

      // 나머지 정적 자산 — immutable cache (hash가 파일명에 포함됨)
      new BucketDeployment(this, 'UserFrontendAssetsDeploy', {
        sources: [
          Source.asset(userDistPath, {
            exclude: ['index.html', 'sw.js', 'registerSW.js', 'workbox-*.js', 'manifest.webmanifest', 'manifest.json'],
          }),
        ],
        destinationBucket:  userBucket,
        distribution:       userDistribution,
        distributionPaths:  ['/*'],
        cacheControl:       [CacheControl.fromString('public,max-age=31536000,immutable')],
        prune:              false,
      });
    } else {
      console.warn('[FrontendStack] frontend/dist not found — skipping user frontend deployment. Run: cd frontend && npm run build');
    }

    // ================================================================
    // 어드민 프론트엔드 — CDK가 신규 S3 + CloudFront 생성
    // ================================================================
    const adminBucket = new Bucket(this, 'AdminStaticBucket', {
      bucketName:        `chme-${stage}-admin-static`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy:     isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    const adminOAI = new OriginAccessIdentity(this, 'AdminOAI', {
      comment: `chme-${stage}-admin-frontend`,
    });
    adminBucket.grantRead(adminOAI);

    const adminDistribution = new Distribution(this, 'AdminDistribution', {
      comment:                `chme-${stage}-admin-frontend`,
      defaultRootObject:      'index.html',
      errorResponses:         SPA_ERROR_RESPONSES,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin:               new S3Origin(adminBucket, { originAccessIdentity: adminOAI }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods:       AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy:          CachePolicy.CACHING_OPTIMIZED,
      },
    });

    const adminDistPath = path.join(__dirname, '../../admin-frontend/dist');
    if (fs.existsSync(adminDistPath)) {
      // index.html — no-cache
      new BucketDeployment(this, 'AdminFrontendIndexDeploy', {
        sources: [
          Source.asset(adminDistPath, {
            exclude: ['**', '!index.html'],
          }),
        ],
        destinationBucket:  adminBucket,
        distribution:       adminDistribution,
        distributionPaths:  ['/index.html'],
        cacheControl:       [CacheControl.noCache()],
        prune:              false,
      });

      // 나머지 자산 — immutable cache
      new BucketDeployment(this, 'AdminFrontendAssetsDeploy', {
        sources: [
          Source.asset(adminDistPath, {
            exclude: ['index.html'],
          }),
        ],
        destinationBucket:  adminBucket,
        distribution:       adminDistribution,
        distributionPaths:  ['/*'],
        cacheControl:       [CacheControl.fromString('public,max-age=31536000,immutable')],
        prune:              false,
      });
    } else {
      console.warn('[FrontendStack] admin-frontend/dist not found — skipping admin frontend deployment. Run: cd admin-frontend && npm run build');
    }

    // ================================================================
    // Outputs
    // ================================================================
    new CfnOutput(this, 'UserAppUrl', {
      value:       `https://${config.domain.app}`,
      description: '유저 앱 URL',
    });
    new CfnOutput(this, 'AdminCloudFrontUrl', {
      value:       `https://${adminDistribution.distributionDomainName}`,
      description: '어드민 앱 CloudFront URL (CNAME 설정 전 임시 URL)',
    });
    new CfnOutput(this, 'AdminDistributionId', {
      value:       adminDistribution.distributionId,
      description: '어드민 CloudFront Distribution ID',
    });
  }
}
