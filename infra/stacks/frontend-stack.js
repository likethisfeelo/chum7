"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrontendStack = void 0;
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
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_s3_1 = require("aws-cdk-lib/aws-s3");
const aws_cloudfront_1 = require("aws-cdk-lib/aws-cloudfront");
const aws_cloudfront_origins_1 = require("aws-cdk-lib/aws-cloudfront-origins");
const aws_s3_deployment_1 = require("aws-cdk-lib/aws-s3-deployment");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// React Router BrowserRouter 지원: 모든 404/403 → /index.html 200
const SPA_ERROR_RESPONSES = [
    {
        httpStatus: 403,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: aws_cdk_lib_1.Duration.seconds(0),
    },
    {
        httpStatus: 404,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: aws_cdk_lib_1.Duration.seconds(0),
    },
];
class FrontendStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage, config } = props;
        const isProd = stage === 'prod';
        // ================================================================
        // 유저 프론트엔드 — 기존 S3 버킷 + CloudFront import
        // ================================================================
        const userBucket = aws_s3_1.Bucket.fromBucketName(this, 'UserStaticBucket', config.s3.staticBucket);
        const userDistribution = aws_cloudfront_1.Distribution.fromDistributionAttributes(this, 'UserDistribution', {
            distributionId: config.cloudfront.distributionId,
            domainName: config.domain.app,
        });
        const userDistPath = path.join(__dirname, '../../frontend/dist');
        if (fs.existsSync(userDistPath)) {
            // index.html — no-cache (항상 최신 entrypoint 받도록)
            new aws_s3_deployment_1.BucketDeployment(this, 'UserFrontendIndexDeploy', {
                sources: [
                    aws_s3_deployment_1.Source.asset(userDistPath, {
                        exclude: ['**', '!index.html'],
                    }),
                ],
                destinationBucket: userBucket,
                distribution: userDistribution,
                distributionPaths: ['/index.html'],
                cacheControl: [aws_s3_deployment_1.CacheControl.noCache()],
                prune: false,
            });
            // 나머지 정적 자산 — immutable cache (hash가 파일명에 포함됨)
            new aws_s3_deployment_1.BucketDeployment(this, 'UserFrontendAssetsDeploy', {
                sources: [
                    aws_s3_deployment_1.Source.asset(userDistPath, {
                        exclude: ['index.html'],
                    }),
                ],
                destinationBucket: userBucket,
                distribution: userDistribution,
                distributionPaths: ['/*'],
                cacheControl: [aws_s3_deployment_1.CacheControl.fromString('public,max-age=31536000,immutable')],
                prune: false,
            });
        }
        else {
            console.warn('[FrontendStack] frontend/dist not found — skipping user frontend deployment. Run: cd frontend && npm run build');
        }
        // ================================================================
        // 어드민 프론트엔드 — CDK가 신규 S3 + CloudFront 생성
        // ================================================================
        const adminBucket = new aws_s3_1.Bucket(this, 'AdminStaticBucket', {
            bucketName: `chme-${stage}-admin-static`,
            blockPublicAccess: aws_s3_1.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: isProd ? aws_cdk_lib_1.RemovalPolicy.RETAIN : aws_cdk_lib_1.RemovalPolicy.DESTROY,
            autoDeleteObjects: !isProd,
        });
        const adminOAI = new aws_cloudfront_1.OriginAccessIdentity(this, 'AdminOAI', {
            comment: `chme-${stage}-admin-frontend`,
        });
        adminBucket.grantRead(adminOAI);
        const adminDistribution = new aws_cloudfront_1.Distribution(this, 'AdminDistribution', {
            comment: `chme-${stage}-admin-frontend`,
            defaultRootObject: 'index.html',
            errorResponses: SPA_ERROR_RESPONSES,
            minimumProtocolVersion: aws_cloudfront_1.SecurityPolicyProtocol.TLS_V1_2_2021,
            defaultBehavior: {
                origin: new aws_cloudfront_origins_1.S3Origin(adminBucket, { originAccessIdentity: adminOAI }),
                viewerProtocolPolicy: aws_cloudfront_1.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: aws_cloudfront_1.AllowedMethods.ALLOW_GET_HEAD,
                cachePolicy: aws_cloudfront_1.CachePolicy.CACHING_OPTIMIZED,
            },
        });
        const adminDistPath = path.join(__dirname, '../../admin-frontend/dist');
        if (fs.existsSync(adminDistPath)) {
            // index.html — no-cache
            new aws_s3_deployment_1.BucketDeployment(this, 'AdminFrontendIndexDeploy', {
                sources: [
                    aws_s3_deployment_1.Source.asset(adminDistPath, {
                        exclude: ['**', '!index.html'],
                    }),
                ],
                destinationBucket: adminBucket,
                distribution: adminDistribution,
                distributionPaths: ['/index.html'],
                cacheControl: [aws_s3_deployment_1.CacheControl.noCache()],
                prune: false,
            });
            // 나머지 자산 — immutable cache
            new aws_s3_deployment_1.BucketDeployment(this, 'AdminFrontendAssetsDeploy', {
                sources: [
                    aws_s3_deployment_1.Source.asset(adminDistPath, {
                        exclude: ['index.html'],
                    }),
                ],
                destinationBucket: adminBucket,
                distribution: adminDistribution,
                distributionPaths: ['/*'],
                cacheControl: [aws_s3_deployment_1.CacheControl.fromString('public,max-age=31536000,immutable')],
                prune: false,
            });
        }
        else {
            console.warn('[FrontendStack] admin-frontend/dist not found — skipping admin frontend deployment. Run: cd admin-frontend && npm run build');
        }
        // ================================================================
        // Outputs
        // ================================================================
        new aws_cdk_lib_1.CfnOutput(this, 'UserAppUrl', {
            value: `https://${config.domain.app}`,
            description: '유저 앱 URL',
        });
        new aws_cdk_lib_1.CfnOutput(this, 'AdminCloudFrontUrl', {
            value: `https://${adminDistribution.distributionDomainName}`,
            description: '어드민 앱 CloudFront URL (CNAME 설정 전 임시 URL)',
        });
        new aws_cdk_lib_1.CfnOutput(this, 'AdminDistributionId', {
            value: adminDistribution.distributionId,
            description: '어드민 CloudFront Distribution ID',
        });
    }
}
exports.FrontendStack = FrontendStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnJvbnRlbmQtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJmcm9udGVuZC1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBOzs7Ozs7Ozs7R0FTRztBQUNILDZDQU1xQjtBQUVyQiwrQ0FBK0Q7QUFDL0QsK0RBUW9DO0FBQ3BDLCtFQUE4RDtBQUM5RCxxRUFBdUY7QUFDdkYsMkNBQTZCO0FBQzdCLHVDQUF5QjtBQU96Qiw4REFBOEQ7QUFDOUQsTUFBTSxtQkFBbUIsR0FBb0I7SUFDM0M7UUFDRSxVQUFVLEVBQUUsR0FBRztRQUNmLGtCQUFrQixFQUFFLEdBQUc7UUFDdkIsZ0JBQWdCLEVBQUUsYUFBYTtRQUMvQixHQUFHLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0tBQ3pCO0lBQ0Q7UUFDRSxVQUFVLEVBQUUsR0FBRztRQUNmLGtCQUFrQixFQUFFLEdBQUc7UUFDdkIsZ0JBQWdCLEVBQUUsYUFBYTtRQUMvQixHQUFHLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0tBQ3pCO0NBQ0YsQ0FBQztBQUVGLE1BQWEsYUFBYyxTQUFRLG1CQUFLO0lBQ3RDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFDaEMsTUFBTSxNQUFNLEdBQUcsS0FBSyxLQUFLLE1BQU0sQ0FBQztRQUVoQyxtRUFBbUU7UUFDbkUsMENBQTBDO1FBQzFDLG1FQUFtRTtRQUNuRSxNQUFNLFVBQVUsR0FBRyxlQUFNLENBQUMsY0FBYyxDQUN0QyxJQUFJLEVBQ0osa0JBQWtCLEVBQ2xCLE1BQU0sQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUN2QixDQUFDO1FBRUYsTUFBTSxnQkFB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Q0FBQyxDQUFDO1FBQzlJLENBQUM7UUFFRCxtRUFBbUU7UUFDbkUsVUFBVTtRQUNWLG1FQUFtRTtRQUNuRSxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNoQyxLQUFLLEVBQVEsV0FBVyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRTtZQUMzQyxXQUFXLEVBQUUsVUFBVTtTQUN4QixDQUFDLENBQUM7UUFDSCxJQUFJLHVCQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3hDLEtBQUssRUFBUSxXQUFXLGlCQUFpQixDQUFDLHNCQUFzQixFQUFFO1lBQ2xFLFdBQVcsRUFBRSwwQ0FBMEM7U0FDeEQsQ0FBQyxDQUFDO1FBQ0gsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUN6QyxLQUFLLEVBQVEsaUJBQWlCLENBQUMsY0FBYztZQUM3QyxXQUFXLEVBQUUsZ0NBQWdDO1NBQzlDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXZJRCxzQ0F1SUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogRnJvbnRlbmQgU3RhY2tcclxuICpcclxuICog7Jyg7KCAIO2UhOuhoO2KuOyXlOuTnDog6riw7KG0IFMzIOuyhO2CtyArIENsb3VkRnJvbnQgaW1wb3J0IOKGkiDtjIzsnbwg67Cw7Y+sICsg7LqQ7IucIOustO2aqO2ZlFxyXG4gKiDslrTrk5zrr7wg7ZSE66Gg7Yq47JeU65OcOiDsi6Dqt5wgUzMg67KE7YK3ICsgQ2xvdWRGcm9udCDsg53shLEg4oaSIO2MjOydvCDrsLDtj6xcclxuICpcclxuICog67Cw7Y+sIOyghCDruYzrk5wg7ZWE7IiYOlxyXG4gKiAgIGNkIGZyb250ZW5kICAgICAgICYmIG5wbSBydW4gYnVpbGQgICDihpIgZnJvbnRlbmQvZGlzdC9cclxuICogICBjZCBhZG1pbi1mcm9udGVuZCAmJiBucG0gcnVuIGJ1aWxkICAg4oaSIGFkbWluLWZyb250ZW5kL2Rpc3QvXHJcbiAqL1xyXG5pbXBvcnQge1xyXG4gIFN0YWNrLFxyXG4gIFN0YWNrUHJvcHMsXHJcbiAgQ2ZuT3V0cHV0LFxyXG4gIFJlbW92YWxQb2xpY3ksXHJcbiAgRHVyYXRpb24sXHJcbn0gZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0IHsgQnVja2V0LCBCbG9ja1B1YmxpY0FjY2VzcyB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XHJcbmltcG9ydCB7XHJcbiAgRGlzdHJpYnV0aW9uLFxyXG4gIFZpZXdlclByb3RvY29sUG9saWN5LFxyXG4gIENhY2hlUG9saWN5LFxyXG4gIEFsbG93ZWRNZXRob2RzLFxyXG4gIEVycm9yUmVzcG9uc2UsXHJcbiAgU2VjdXJpdHlQb2xpY3lQcm90b2NvbCxcclxuICBPcmlnaW5BY2Nlc3NJZGVudGl0eSxcclxufSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XHJcbmltcG9ydCB7IFMzT3JpZ2luIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XHJcbmltcG9ydCB7IEJ1Y2tldERlcGxveW1lbnQsIFNvdXJjZSwgQ2FjaGVDb250cm9sIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLWRlcGxveW1lbnQnO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XHJcblxyXG5pbnRlcmZhY2UgRnJvbnRlbmRTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XHJcbiAgc3RhZ2U6IHN0cmluZztcclxuICBjb25maWc6IGFueTtcclxufVxyXG5cclxuLy8gUmVhY3QgUm91dGVyIEJyb3dzZXJSb3V0ZXIg7KeA7JuQOiDrqqjrk6AgNDA0LzQwMyDihpIgL2luZGV4Lmh0bWwgMjAwXHJcbmNvbnN0IFNQQV9FUlJPUl9SRVNQT05TRVM6IEVycm9yUmVzcG9uc2VbXSA9IFtcclxuICB7XHJcbiAgICBodHRwU3RhdHVzOiA0MDMsXHJcbiAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcclxuICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvaW5kZXguaHRtbCcsXHJcbiAgICB0dGw6IER1cmF0aW9uLnNlY29uZHMoMCksXHJcbiAgfSxcclxuICB7XHJcbiAgICBodHRwU3RhdHVzOiA0MDQsXHJcbiAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcclxuICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvaW5kZXguaHRtbCcsXHJcbiAgICB0dGw6IER1cmF0aW9uLnNlY29uZHMoMCksXHJcbiAgfSxcclxuXTtcclxuXHJcbmV4cG9ydCBjbGFzcyBGcm9udGVuZFN0YWNrIGV4dGVuZHMgU3RhY2sge1xyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBGcm9udGVuZFN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIGNvbnN0IHsgc3RhZ2UsIGNvbmZpZyB9ID0gcHJvcHM7XHJcbiAgICBjb25zdCBpc1Byb2QgPSBzdGFnZSA9PT0gJ3Byb2QnO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIOycoOyggCDtlITroaDtirjsl5Trk5wg4oCUIOq4sOyhtCBTMyDrsoTtgrcgKyBDbG91ZEZyb250IGltcG9ydFxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgY29uc3QgdXNlckJ1Y2tldCA9IEJ1Y2tldC5mcm9tQnVja2V0TmFtZShcclxuICAgICAgdGhpcyxcclxuICAgICAgJ1VzZXJTdGF0aWNCdWNrZXQnLFxyXG4gICAgICBjb25maWcuczMuc3RhdGljQnVja2V0LFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCB1c2VyRGlzdHJpYnV0aW9uID0gRGlzdHJpYnV0aW9uLmZyb21EaXN0cmlidXRpb25BdHRyaWJ1dGVzKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICAnVXNlckRpc3RyaWJ1dGlvbicsXHJcbiAgICAgIHtcclxuICAgICAgICBkaXN0cmlidXRpb25JZDogY29uZmlnLmNsb3VkZnJvbnQuZGlzdHJpYnV0aW9uSWQsXHJcbiAgICAgICAgZG9tYWluTmFtZTogICAgIGNvbmZpZy5kb21haW4uYXBwLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCB1c2VyRGlzdFBhdGggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vZnJvbnRlbmQvZGlzdCcpO1xyXG4gICAgaWYgKGZzLmV4aXN0c1N5bmModXNlckRpc3RQYXRoKSkge1xyXG4gICAgICAvLyBpbmRleC5odG1sIOKAlCBuby1jYWNoZSAo7ZWt7IOBIOy1nOyLoCBlbnRyeXBvaW50IOuwm+uPhOuhnSlcclxuICAgICAgbmV3IEJ1Y2tldERlcGxveW1lbnQodGhpcywgJ1VzZXJGcm9udGVuZEluZGV4RGVwbG95Jywge1xyXG4gICAgICAgIHNvdXJjZXM6IFtcclxuICAgICAgICAgIFNvdXJjZS5hc3NldCh1c2VyRGlzdFBhdGgsIHtcclxuICAgICAgICAgICAgZXhjbHVkZTogWycqKicsICchaW5kZXguaHRtbCddLFxyXG4gICAgICAgICAgfSksXHJcbiAgICAgICAgXSxcclxuICAgICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogIHVzZXJCdWNrZXQsXHJcbiAgICAgICAgZGlzdHJpYnV0aW9uOiAgICAgICB1c2VyRGlzdHJpYnV0aW9uLFxyXG4gICAgICAgIGRpc3RyaWJ1dGlvblBhdGhzOiAgWycvaW5kZXguaHRtbCddLFxyXG4gICAgICAgIGNhY2hlQ29udHJvbDogICAgICAgW0NhY2hlQ29udHJvbC5ub0NhY2hlKCldLFxyXG4gICAgICAgIHBydW5lOiAgICAgICAgICAgICAgZmFsc2UsXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8g64KY66i47KeAIOygleyggSDsnpDsgrAg4oCUIGltbXV0YWJsZSBjYWNoZSAoaGFzaOqwgCDtjIzsnbzrqoXsl5Ag7Y+s7ZWo65CoKVxyXG4gICAgICBuZXcgQnVja2V0RGVwbG95bWVudCh0aGlzLCAnVXNlckZyb250ZW5kQXNzZXRzRGVwbG95Jywge1xyXG4gICAgICAgIHNvdXJjZXM6IFtcclxuICAgICAgICAgIFNvdXJjZS5hc3NldCh1c2VyRGlzdFBhdGgsIHtcclxuICAgICAgICAgICAgZXhjbHVkZTogWydpbmRleC5odG1sJ10sXHJcbiAgICAgICAgICB9KSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiAgdXNlckJ1Y2tldCxcclxuICAgICAgICBkaXN0cmlidXRpb246ICAgICAgIHVzZXJEaXN0cmlidXRpb24sXHJcbiAgICAgICAgZGlzdHJpYnV0aW9uUGF0aHM6ICBbJy8qJ10sXHJcbiAgICAgICAgY2FjaGVDb250cm9sOiAgICAgICBbQ2FjaGVDb250cm9sLmZyb21TdHJpbmcoJ3B1YmxpYyxtYXgtYWdlPTMxNTM2MDAwLGltbXV0YWJsZScpXSxcclxuICAgICAgICBwcnVuZTogICAgICAgICAgICAgIGZhbHNlLFxyXG4gICAgICB9KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnNvbGUud2FybignW0Zyb250ZW5kU3RhY2tdIGZyb250ZW5kL2Rpc3Qgbm90IGZvdW5kIOKAlCBza2lwcGluZyB1c2VyIGZyb250ZW5kIGRlcGxveW1lbnQuIFJ1bjogY2QgZnJvbnRlbmQgJiYgbnBtIHJ1biBidWlsZCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIOyWtOuTnOuvvCDtlITroaDtirjsl5Trk5wg4oCUIENES+qwgCDsi6Dqt5wgUzMgKyBDbG91ZEZyb250IOyDneyEsVxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgY29uc3QgYWRtaW5CdWNrZXQgPSBuZXcgQnVja2V0KHRoaXMsICdBZG1pblN0YXRpY0J1Y2tldCcsIHtcclxuICAgICAgYnVja2V0TmFtZTogICAgICAgIGBjaG1lLSR7c3RhZ2V9LWFkbWluLXN0YXRpY2AsXHJcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBCbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6ICAgICBpc1Byb2QgPyBSZW1vdmFsUG9saWN5LlJFVEFJTiA6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6ICFpc1Byb2QsXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBhZG1pbk9BSSA9IG5ldyBPcmlnaW5BY2Nlc3NJZGVudGl0eSh0aGlzLCAnQWRtaW5PQUknLCB7XHJcbiAgICAgIGNvbW1lbnQ6IGBjaG1lLSR7c3RhZ2V9LWFkbWluLWZyb250ZW5kYCxcclxuICAgIH0pO1xyXG4gICAgYWRtaW5CdWNrZXQuZ3JhbnRSZWFkKGFkbWluT0FJKTtcclxuXHJcbiAgICBjb25zdCBhZG1pbkRpc3RyaWJ1dGlvbiA9IG5ldyBEaXN0cmlidXRpb24odGhpcywgJ0FkbWluRGlzdHJpYnV0aW9uJywge1xyXG4gICAgICBjb21tZW50OiAgICAgICAgICAgICAgICBgY2htZS0ke3N0YWdlfS1hZG1pbi1mcm9udGVuZGAsXHJcbiAgICAgIGRlZmF1bHRSb290T2JqZWN0OiAgICAgICdpbmRleC5odG1sJyxcclxuICAgICAgZXJyb3JSZXNwb25zZXM6ICAgICAgICAgU1BBX0VSUk9SX1JFU1BPTlNFUyxcclxuICAgICAgbWluaW11bVByb3RvY29sVmVyc2lvbjogU2VjdXJpdHlQb2xpY3lQcm90b2NvbC5UTFNfVjFfMl8yMDIxLFxyXG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcclxuICAgICAgICBvcmlnaW46ICAgICAgICAgICAgICAgbmV3IFMzT3JpZ2luKGFkbWluQnVja2V0LCB7IG9yaWdpbkFjY2Vzc0lkZW50aXR5OiBhZG1pbk9BSSB9KSxcclxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXHJcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6ICAgICAgIEFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFELFxyXG4gICAgICAgIGNhY2hlUG9saWN5OiAgICAgICAgICBDYWNoZVBvbGljeS5DQUNISU5HX09QVElNSVpFRCxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IGFkbWluRGlzdFBhdGggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYWRtaW4tZnJvbnRlbmQvZGlzdCcpO1xyXG4gICAgaWYgKGZzLmV4aXN0c1N5bmMoYWRtaW5EaXN0UGF0aCkpIHtcclxuICAgICAgLy8gaW5kZXguaHRtbCDigJQgbm8tY2FjaGVcclxuICAgICAgbmV3IEJ1Y2tldERlcGxveW1lbnQodGhpcywgJ0FkbWluRnJvbnRlbmRJbmRleERlcGxveScsIHtcclxuICAgICAgICBzb3VyY2VzOiBbXHJcbiAgICAgICAgICBTb3VyY2UuYXNzZXQoYWRtaW5EaXN0UGF0aCwge1xyXG4gICAgICAgICAgICBleGNsdWRlOiBbJyoqJywgJyFpbmRleC5odG1sJ10sXHJcbiAgICAgICAgICB9KSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiAgYWRtaW5CdWNrZXQsXHJcbiAgICAgICAgZGlzdHJpYnV0aW9uOiAgICAgICBhZG1pbkRpc3RyaWJ1dGlvbixcclxuICAgICAgICBkaXN0cmlidXRpb25QYXRoczogIFsnL2luZGV4Lmh0bWwnXSxcclxuICAgICAgICBjYWNoZUNvbnRyb2w6ICAgICAgIFtDYWNoZUNvbnRyb2wubm9DYWNoZSgpXSxcclxuICAgICAgICBwcnVuZTogICAgICAgICAgICAgIGZhbHNlLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIOuCmOuouOyngCDsnpDsgrAg4oCUIGltbXV0YWJsZSBjYWNoZVxyXG4gICAgICBuZXcgQnVja2V0RGVwbG95bWVudCh0aGlzLCAnQWRtaW5Gcm9udGVuZEFzc2V0c0RlcGxveScsIHtcclxuICAgICAgICBzb3VyY2VzOiBbXHJcbiAgICAgICAgICBTb3VyY2UuYXNzZXQoYWRtaW5EaXN0UGF0aCwge1xyXG4gICAgICAgICAgICBleGNsdWRlOiBbJ2luZGV4Lmh0bWwnXSxcclxuICAgICAgICAgIH0pLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgZGVzdGluYXRpb25CdWNrZXQ6ICBhZG1pbkJ1Y2tldCxcclxuICAgICAgICBkaXN0cmlidXRpb246ICAgICAgIGFkbWluRGlzdHJpYnV0aW9uLFxyXG4gICAgICAgIGRpc3RyaWJ1dGlvblBhdGhzOiAgWycvKiddLFxyXG4gICAgICAgIGNhY2hlQ29udHJvbDogICAgICAgW0NhY2hlQ29udHJvbC5mcm9tU3RyaW5nKCdwdWJsaWMsbWF4LWFnZT0zMTUzNjAwMCxpbW11dGFibGUnKV0sXHJcbiAgICAgICAgcHJ1bmU6ICAgICAgICAgICAgICBmYWxzZSxcclxuICAgICAgfSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ1tGcm9udGVuZFN0YWNrXSBhZG1pbi1mcm9udGVuZC9kaXN0IG5vdCBmb3VuZCDigJQgc2tpcHBpbmcgYWRtaW4gZnJvbnRlbmQgZGVwbG95bWVudC4gUnVuOiBjZCBhZG1pbi1mcm9udGVuZCAmJiBucG0gcnVuIGJ1aWxkJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gT3V0cHV0c1xyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCAnVXNlckFwcFVybCcsIHtcclxuICAgICAgdmFsdWU6ICAgICAgIGBodHRwczovLyR7Y29uZmlnLmRvbWFpbi5hcHB9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICfsnKDsoIAg7JWxIFVSTCcsXHJcbiAgICB9KTtcclxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0FkbWluQ2xvdWRGcm9udFVybCcsIHtcclxuICAgICAgdmFsdWU6ICAgICAgIGBodHRwczovLyR7YWRtaW5EaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ+yWtOuTnOuvvCDslbEgQ2xvdWRGcm9udCBVUkwgKENOQU1FIOyEpOyglSDsoIQg7J6E7IucIFVSTCknLFxyXG4gICAgfSk7XHJcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdBZG1pbkRpc3RyaWJ1dGlvbklkJywge1xyXG4gICAgICB2YWx1ZTogICAgICAgYWRtaW5EaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uSWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAn7Ja065Oc66+8IENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIElEJyxcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=