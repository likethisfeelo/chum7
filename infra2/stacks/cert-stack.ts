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
  }
}
