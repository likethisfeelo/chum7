/**
 * Frontend Stack
 *
 * 이미 존재하는 S3 + CloudFront를 참조해서 프론트엔드를 배포한다.
 * `cdk deploy` 시 로컬에서 npm run build를 실행한 뒤 S3에 sync하고
 * CloudFront를 무효화(invalidation)한다.
 *
 * 배포 흐름:
 *   cdk deploy
 *     → VITE_API_URL 환경변수 주입하며 npm run build 실행 (로컬 번들링)
 *     → dist/ 내용을 S3 버킷에 sync (변경된 파일만)
 *     → CloudFront /* invalidation (새 파일 즉시 반영)
 *
 * 버킷 구조:
 *   chme-dev/          ← 유저 앱 (test.chum7.com)
 *   chme-dev/admin/    ← 어드민 앱 (admin-dev.chum7.com → CF behavior /admin/*)
 */
import { Stack, StackProps, DockerImage } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Distribution } from 'aws-cdk-lib/aws-cloudfront';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { execSync } from 'child_process';
import * as path from 'path';

interface FrontendStackProps extends StackProps {
  stage: string;
  config: any;
}

export class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { stage, config } = props;

    const apiUrl   = `https://${config.domain.api}`;
    const appUrl   = `https://${config.domain.app}`;
    const adminUrl = `https://${config.domain.admin}`;

    // ── 기존 리소스 참조 ─────────────────────────────────────────────
    const bucket = Bucket.fromBucketName(this, 'AppBucket', config.s3.staticBucket);

    const distribution = Distribution.fromDistributionAttributes(this, 'AppDistribution', {
      distributionId: config.cloudfront.distributionId,
      domainName:     config.domain.app,
    });

    // ── 유저 앱 배포 ─────────────────────────────────────────────────
    // 버킷 루트 (/) → test.chum7.com / www.chum7.com
    new BucketDeployment(this, 'UserFrontendDeploy', {
      sources: [
        Source.asset(path.join(__dirname, '../../frontend'), {
          // Docker 빌드 (CI 환경 fallback)
          bundling: {
            image: DockerImage.fromRegistry('public.ecr.aws/sam/build-nodejs20.x'),
            user: 'root',
            environment: {
              VITE_API_URL: apiUrl,
              VITE_APP_URL: appUrl,
              NODE_ENV: 'production',
            },
            command: [
              'bash', '-c',
              'npm ci --silent && npm run build && cp -r dist/. /asset-output/',
            ],
          },
          // 로컬 빌드 (개발자 로컬 배포 — 더 빠름, Docker 불필요)
          local: {
            tryBundle(outputDir: string): boolean {
              try {
                const frontendDir = path.join(__dirname, '../../frontend');
                console.log(`\n🔨 Building user frontend (${stage})...`);
                execSync(`npm run build`, {
                  cwd: frontendDir,
                  stdio: 'inherit',
                  env: {
                    ...process.env,
                    VITE_API_URL: apiUrl,
                    VITE_APP_URL: appUrl,
                    NODE_ENV: 'production',
                  },
                });
                execSync(`cp -r dist/. "${outputDir}"`, { cwd: frontendDir, stdio: 'inherit' });
                console.log('✅ User frontend build done\n');
                return true;
              } catch (e) {
                console.error('❌ Local build failed, falling back to Docker:', e);
                return false;
              }
            },
          },
        }),
      ],
      destinationBucket:  bucket,
      distribution,
      distributionPaths:  ['/*'],
      // index.html은 캐시 짧게, 나머지 해시된 에셋은 길게
      cacheControl: [],  // CDK BucketDeployment defaults (no-cache for root, 1yr for assets)
      prune: true,  // S3에서 삭제된 파일 제거
      memoryLimit: 256,
    });

    // ── 어드민 앱 배포 ────────────────────────────────────────────────
    // 버킷의 admin/ 프리픽스 → admin-dev.chum7.com / admin.chum7.com
    // CloudFront에서 /admin/* origin을 이 경로로 연결해야 함
    new BucketDeployment(this, 'AdminFrontendDeploy', {
      sources: [
        Source.asset(path.join(__dirname, '../../admin-frontend'), {
          bundling: {
            image: DockerImage.fromRegistry('public.ecr.aws/sam/build-nodejs20.x'),
            user: 'root',
            environment: {
              VITE_API_URL: apiUrl,
              VITE_ADMIN_URL: adminUrl,
              NODE_ENV: 'production',
            },
            command: [
              'bash', '-c',
              'npm ci --silent && npm run build && cp -r dist/. /asset-output/',
            ],
          },
          local: {
            tryBundle(outputDir: string): boolean {
              try {
                const adminDir = path.join(__dirname, '../../admin-frontend');
                console.log(`\n🔨 Building admin frontend (${stage})...`);
                execSync(`npm run build`, {
                  cwd: adminDir,
                  stdio: 'inherit',
                  env: {
                    ...process.env,
                    VITE_API_URL: apiUrl,
                    VITE_ADMIN_URL: adminUrl,
                    NODE_ENV: 'production',
                  },
                });
                execSync(`cp -r dist/. "${outputDir}"`, { cwd: adminDir, stdio: 'inherit' });
                console.log('✅ Admin frontend build done\n');
                return true;
              } catch (e) {
                console.error('❌ Local admin build failed, falling back to Docker:', e);
                return false;
              }
            },
          },
        }),
      ],
      destinationBucket:       bucket,
      destinationKeyPrefix:    'admin',
      distribution,
      distributionPaths:       ['/admin/*'],
      prune:                   true,
      memoryLimit:             256,
    });
  }
}
