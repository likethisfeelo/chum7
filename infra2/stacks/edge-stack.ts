import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { StatefulStack } from './stateful-stack';
import { StageConfig } from '../config/stages';

export interface EdgeStackProps extends cdk.StackProps {
  config: StageConfig;
  stateful: StatefulStack;
  /** config.domain 설정 시 CertStack에서 전달 */
  certificate?: acm.ICertificate;
  /** apex(chum7.com)→www 리다이렉트용 인증서 (config.domain 설정 시) */
  apexCertificate?: acm.ICertificate;
}

/**
 * CloudFront 2개(app/admin) + /uploads/* 비헤이비어 + (도메인 설정 시) Route53 레코드.
 * 전부 CDK가 생성 — import·커스텀 리소스 없음 (기존 cf-uploads-behavior 커스텀 리소스 폐지).
 * 프론트 산출물 업로드도 BucketDeployment 단일 경로 (수동 s3 sync 폐지).
 *
 * 정적 사이트 버킷 2개는 빌드 산출물 저장소이므로 이 스택이 소유한다 (Stateful 아님).
 * uploads 버킷(사용자 콘텐츠)은 StatefulStack 소유 — 순환 참조를 피하기 위해 이름으로
 * 참조만 하고, CloudFront OAC 읽기 정책은 StatefulStack이 단독 소유한다
 * (버킷 정책은 하나뿐이라 두 스택에서 만들면 서로 덮어쓰는 문제 방지).
 */
export class EdgeStack extends cdk.Stack {
  readonly appDistribution: cloudfront.Distribution;
  readonly adminDistribution: cloudfront.Distribution;
  readonly staticBucket: s3.Bucket;
  readonly adminStaticBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);
    const { config, stateful, certificate, apexCertificate } = props;
    const domain = config.domain;

    const siteBucketDefaults: s3.BucketProps = {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 빌드 산출물 — 언제든 재생성 가능
      autoDeleteObjects: true,
    };
    // 계정 ID 접미사 — S3 버킷명 전역 유니크 (계정 바뀌어도 충돌 방지)
    this.staticBucket = new s3.Bucket(this, 'StaticBucket', {
      ...siteBucketDefaults,
      bucketName: `${config.prefix}-static-${this.account}`,
    });
    this.adminStaticBucket = new s3.Bucket(this, 'AdminStaticBucket', {
      ...siteBucketDefaults,
      bucketName: `${config.prefix}-admin-static-${this.account}`,
    });

    // uploads 버킷은 이름 참조 (소유는 StatefulStack — 순환 참조 방지)
    const uploadsBucket = s3.Bucket.fromBucketName(
      this,
      'UploadsBucketRef',
      stateful.uploadsBucket.bucketName,
    );

    const staticOrigin = origins.S3BucketOrigin.withOriginAccessControl(this.staticBucket);
    const adminOrigin = origins.S3BucketOrigin.withOriginAccessControl(this.adminStaticBucket);
    const uploadsOrigin = origins.S3BucketOrigin.withOriginAccessControl(uploadsBucket);

    const spaErrorResponses: cloudfront.ErrorResponse[] = [
      { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
      { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
    ];
    const behaviorDefaults = {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
    };

    // 공유 링크 OG 페이지 — www/share/* 를 API(challenge-api /share/:id)로 라우팅해
    //  카톡·슬랙 등이 챌린지별 OG(썸네일·제목·설명)를 읽게 한다. 커스텀 도메인(prod)에서만.
    //  origin request policy로 쿼리스트링을 전달(공유 캐시 무효화 파라미터 대비), Host는 API 도메인 자동.
    const shareBehavior: Record<string, cloudfront.BehaviorOptions> = domain
      ? {
          '/share/*': {
            origin: new origins.HttpOrigin(domain.api, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            }),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
            originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          },
        }
      : {};

    this.appDistribution = new cloudfront.Distribution(this, 'AppDistribution', {
      comment: `${config.prefix}-app`,
      defaultBehavior: { ...behaviorDefaults, origin: staticOrigin },
      additionalBehaviors: {
        '/uploads/*': { ...behaviorDefaults, origin: uploadsOrigin },
        ...shareBehavior,
      },
      defaultRootObject: 'index.html',
      errorResponses: spaErrorResponses,
      ...(domain && certificate ? { domainNames: [domain.app], certificate } : {}),
    });

    this.adminDistribution = new cloudfront.Distribution(this, 'AdminDistribution', {
      comment: `${config.prefix}-admin`,
      defaultBehavior: { ...behaviorDefaults, origin: adminOrigin },
      additionalBehaviors: { '/uploads/*': { ...behaviorDefaults, origin: uploadsOrigin } },
      defaultRootObject: 'index.html',
      errorResponses: spaErrorResponses,
      ...(domain && certificate ? { domainNames: [domain.admin], certificate } : {}),
    });

    // uploads 버킷의 CloudFront OAC 읽기 정책은 StatefulStack이 단독 소유한다
    // (버킷 정책은 하나뿐 — 두 스택에서 만들면 서로 덮어씀). 여기서는 정책을 만들지 않는다.
    // withOriginAccessControl의 "imported bucket 정책 미갱신" 경고는 무해하다.

    if (domain) {
      const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: domain.zoneName });
      // deleteExisting: 구 시스템의 수동 생성 레코드를 대체 — 이 배포가 곧 DNS 전환이다
      // (docs/cutover-runbook.md 참조)
      new route53.ARecord(this, 'AppAlias', {
        zone,
        recordName: domain.app,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.appDistribution)),
        deleteExisting: true,
      });
      new route53.ARecord(this, 'AdminAlias', {
        zone,
        recordName: domain.admin,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.adminDistribution)),
        deleteExisting: true,
      });

      // --- apex(chum7.com) → www 리다이렉트 ---
      // 맨 도메인으로 접속해도 https://www... 로 301. 전용 배포 + CloudFront Function.
      // origin은 함수가 viewer-request에서 301을 반환해 실제로 도달하지 않으므로 아무거나(staticOrigin) 재사용.
      if (apexCertificate) {
        const redirectFn = new cloudfront.Function(this, 'ApexRedirectFn', {
          comment: `${config.prefix} apex→www 301`,
          code: cloudfront.FunctionCode.fromInline(
            `function handler(event) {\n` +
              `  var req = event.request;\n` +
              `  var qs = '';\n` +
              `  var first = true;\n` +
              `  for (var k in req.querystring) {\n` +
              `    qs += (first ? '?' : '&') + k + '=' + req.querystring[k].value;\n` +
              `    first = false;\n` +
              `  }\n` +
              `  return {\n` +
              `    statusCode: 301,\n` +
              `    statusDescription: 'Moved Permanently',\n` +
              `    headers: { location: { value: 'https://${domain.app}' + req.uri + qs } }\n` +
              `  };\n` +
              `}`,
          ),
        });
        const apexRedirect = new cloudfront.Distribution(this, 'ApexRedirectDistribution', {
          comment: `${config.prefix}-apex-redirect`,
          defaultBehavior: {
            ...behaviorDefaults,
            origin: staticOrigin,
            functionAssociations: [
              { function: redirectFn, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
            ],
          },
          domainNames: [domain.zoneName],
          certificate: apexCertificate,
        });
        new route53.ARecord(this, 'ApexAlias', {
          zone,
          recordName: domain.zoneName,
          target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(apexRedirect)),
          deleteExisting: true,
        });
        new route53.AaaaRecord(this, 'ApexAliasAAAA', {
          zone,
          recordName: domain.zoneName,
          target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(apexRedirect)),
          deleteExisting: true,
        });
      }
    }

    // 프론트 산출물 배포 — dist가 없으면 스킵 (deploy.mjs가 빌드 순서를 보장한다)
    const frontendDist = join(__dirname, '../../frontend/dist');
    if (existsSync(frontendDist)) {
      new s3deploy.BucketDeployment(this, 'AppDeployment', {
        sources: [s3deploy.Source.asset(frontendDist)],
        destinationBucket: this.staticBucket,
        distribution: this.appDistribution,
        distributionPaths: ['/*'],
      });
    } else {
      cdk.Annotations.of(this).addInfo('frontend/dist 없음 — 앱 정적 배포 스킵');
    }
    const adminDist = join(__dirname, '../../admin-frontend/dist');
    if (existsSync(adminDist)) {
      new s3deploy.BucketDeployment(this, 'AdminDeployment', {
        sources: [s3deploy.Source.asset(adminDist)],
        destinationBucket: this.adminStaticBucket,
        distribution: this.adminDistribution,
        distributionPaths: ['/*'],
      });
    } else {
      cdk.Annotations.of(this).addInfo('admin-frontend/dist 없음 — 어드민 정적 배포 스킵');
    }

    new cdk.CfnOutput(this, 'AppUrl', {
      value: domain ? `https://${domain.app}` : `https://${this.appDistribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'AdminUrl', {
      value: domain ? `https://${domain.admin}` : `https://${this.adminDistribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'AppDistributionId', { value: this.appDistribution.distributionId });
    new cdk.CfnOutput(this, 'AdminDistributionId', { value: this.adminDistribution.distributionId });
  }
}
