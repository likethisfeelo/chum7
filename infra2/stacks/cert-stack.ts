import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { StageConfig } from '../config/stages';

export interface CertStackProps extends cdk.StackProps {
  config: StageConfig;
}

/**
 * CloudFront용 ACM 인증서 — us-east-1 고정, crossRegionReferences로 EdgeStack에 전달.
 * config.domain이 설정된 경우에만 생성된다.
 */
export class CertStack extends cdk.Stack {
  readonly certificate: acm.ICertificate;
  /** apex(chum7.com) 리다이렉트 배포용 — 기존 www/admin 인증서와 분리해 무간섭 */
  readonly apexCertificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: CertStackProps) {
    super(scope, id, props);
    const domain = props.config.domain;
    if (!domain) throw new Error('CertStack requires config.domain');

    const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: domain.zoneName });
    this.certificate = new acm.Certificate(this, 'EdgeCertificate', {
      domainName: domain.app,
      subjectAlternativeNames: [domain.admin],
      validation: acm.CertificateValidation.fromDns(zone),
    });
    // apex(맨 도메인) 전용 인증서 — apex→www 리다이렉트 배포에서 사용.
    // 별도 인증서라 잘 발급된 www/admin 인증서를 교체하지 않는다.
    this.apexCertificate = new acm.Certificate(this, 'ApexCertificate', {
      domainName: domain.zoneName,
      validation: acm.CertificateValidation.fromDns(zone),
    });
  }
}
