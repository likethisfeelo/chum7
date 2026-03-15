/**
 * Lambda-backed CDK Custom Resource
 * Adds an /uploads/* cache behavior to an existing CloudFront distribution,
 * pointing to the uploads S3 bucket.
 *
 * Why this is needed: the user-facing CloudFront distribution is imported
 * (pre-existing), so L2 addBehavior() is unavailable. This resource handles
 * the ETag-based get/update loop required by the CloudFront API.
 */
import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  CreateCloudFrontOriginAccessControlCommand,
  ListCloudFrontOriginAccessControlsCommand,
  type CacheBehavior,
  type Origin,
} from '@aws-sdk/client-cloudfront';

const cf = new CloudFrontClient({ region: 'us-east-1' });

// AWS managed CachingOptimized policy id
const CACHING_OPTIMIZED_POLICY_ID = '658327ea-f89d-4fab-a63d-7e88639e58f6';
const UPLOADS_PATH_PATTERN = '/uploads/*';
const UPLOADS_ORIGIN_ID = 'chme-uploads-s3';

async function getOrCreateOAC(bucketName: string, stage: string): Promise<string> {
  const oacComment = `chme-${stage}-uploads-oac`;

  // Check if OAC already exists
  const listResp = await cf.send(new ListCloudFrontOriginAccessControlsCommand({}));
  const existing = listResp.CloudFrontOriginAccessControlList?.Items?.find(
    (oac) => oac.Comment === oacComment,
  );
  if (existing?.Id) return existing.Id;

  // Create new OAC
  const createResp = await cf.send(
    new CreateCloudFrontOriginAccessControlCommand({
      CloudFrontOriginAccessControlConfig: {
        Name: oacComment,
        Description: `OAC for chme-${stage} uploads bucket`,
        SigningProtocol: 'sigv4',
        SigningBehavior: 'always',
        OriginAccessControlOriginType: 's3',
      },
    }),
  );
  return createResp.CloudFrontOriginAccessControl!.Id!;
}

export const handler = async (event: any): Promise<any> => {
  console.log('CFUploadsBehavior event:', JSON.stringify(event));

  const { DistributionId, UploadsBucketName, UploadsBucketRegion, Stage } =
    event.ResourceProperties as {
      DistributionId: string;
      UploadsBucketName: string;
      UploadsBucketRegion: string;
      Stage: string;
    };

  const requestType: string = event.RequestType;

  // On Delete we leave the behavior in place (safe to not clean up)
  if (requestType === 'Delete') {
    return { PhysicalResourceId: `cf-uploads-${DistributionId}` };
  }

  try {
    // 1. Get current config + ETag
    const configResp = await cf.send(
      new GetDistributionConfigCommand({ Id: DistributionId }),
    );
    const config = configResp.DistributionConfig!;
    const etag = configResp.ETag!;

    // 2. Idempotency check — skip if behavior already exists
    const existingBehaviors = config.CacheBehaviors?.Items ?? [];
    if (existingBehaviors.some((b) => b.PathPattern === UPLOADS_PATH_PATTERN)) {
      console.log('/uploads/* behavior already present, skipping update.');
      return { PhysicalResourceId: `cf-uploads-${DistributionId}` };
    }

    // 3. Create / reuse OAC
    const oacId = await getOrCreateOAC(UploadsBucketName, Stage);

    // 4. Add the S3 origin for the uploads bucket
    const uploadsDomainName = `${UploadsBucketName}.s3.${UploadsBucketRegion}.amazonaws.com`;
    const origins = config.Origins ?? { Quantity: 0, Items: [] };
    const originExists = (origins.Items ?? []).some((o) => o.Id === UPLOADS_ORIGIN_ID);
    if (!originExists) {
      const newOrigin: Origin = {
        Id: UPLOADS_ORIGIN_ID,
        DomainName: uploadsDomainName,
        S3OriginConfig: { OriginAccessIdentity: '' }, // required when using OAC
        OriginAccessControlId: oacId,
      };
      origins.Items = [...(origins.Items ?? []), newOrigin];
      origins.Quantity = origins.Items.length;
      config.Origins = origins;
    }

    // 5. Add the /uploads/* cache behavior
    const newBehavior: CacheBehavior = {
      PathPattern: UPLOADS_PATH_PATTERN,
      TargetOriginId: UPLOADS_ORIGIN_ID,
      ViewerProtocolPolicy: 'redirect-to-https',
      AllowedMethods: {
        Quantity: 2,
        Items: ['GET', 'HEAD'],
        CachedMethods: { Quantity: 2, Items: ['GET', 'HEAD'] },
      },
      CachePolicyId: CACHING_OPTIMIZED_POLICY_ID,
      Compress: true,
      FieldLevelEncryptionId: '',
      TrustedSigners: { Enabled: false, Quantity: 0 },
      TrustedKeyGroups: { Enabled: false, Quantity: 0 },
      FunctionAssociations: { Quantity: 0, Items: [] },
      LambdaFunctionAssociations: { Quantity: 0, Items: [] },
      SmoothStreaming: false,
    };

    const cacheBehaviors = config.CacheBehaviors ?? { Quantity: 0, Items: [] };
    cacheBehaviors.Items = [...(cacheBehaviors.Items ?? []), newBehavior];
    cacheBehaviors.Quantity = cacheBehaviors.Items.length;
    config.CacheBehaviors = cacheBehaviors;

    // 6. Update the distribution
    await cf.send(
      new UpdateDistributionCommand({
        Id: DistributionId,
        IfMatch: etag,
        DistributionConfig: config,
      }),
    );

    console.log('Successfully added /uploads/* behavior to distribution', DistributionId);
    return { PhysicalResourceId: `cf-uploads-${DistributionId}` };
  } catch (err: any) {
    console.error('CFUploadsBehavior error:', err);
    throw err;
  }
};
