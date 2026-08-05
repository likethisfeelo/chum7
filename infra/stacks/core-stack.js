"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoreStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_cognito_1 = require("aws-cdk-lib/aws-cognito");
const aws_dynamodb_1 = require("aws-cdk-lib/aws-dynamodb");
const aws_s3_1 = require("aws-cdk-lib/aws-s3");
const aws_sns_1 = require("aws-cdk-lib/aws-sns");
const aws_events_1 = require("aws-cdk-lib/aws-events");
class CoreStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage, config } = props;
        // ==================== Cognito ====================
        this.userPool = new aws_cognito_1.UserPool(this, 'UserPool', {
            userPoolName: `chum7-${stage}-users`,
            selfSignUpEnabled: true,
            signInAliases: { email: true },
            autoVerify: { email: true },
            accountRecovery: aws_cognito_1.AccountRecovery.EMAIL_ONLY,
            mfa: aws_cognito_1.Mfa.OPTIONAL,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
        });
        this.userPoolClient = this.userPool.addClient('UserPoolClient', {
            userPoolClientName: `chum7-${stage}-client`,
            authFlows: { userPassword: true },
        });
        this.adminsGroup = new aws_cognito_1.CfnUserPoolGroup(this, 'AdminsGroup', {
            userPoolId: this.userPool.userPoolId,
            groupName: 'admins',
        });
        // ==================== DynamoDB ====================
        const isProd = stage === 'prod';
        const removalPolicy = isProd ? aws_cdk_lib_1.RemovalPolicy.RETAIN : aws_cdk_lib_1.RemovalPolicy.DESTROY;
        this.usersTable = new aws_dynamodb_1.Table(this, 'UsersTable', {
            tableName: `chme-${stage}-users`,
            partitionKey: { name: 'userId', type: aws_dynamodb_1.AttributeType.STRING },
            billingMode: aws_dynamodb_1.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
            removalPolicy,
            stream: aws_dynamodb_1.StreamViewType.NEW_AND_OLD_IMAGES,
        });
        this.usersTable.addGlobalSecondaryIndex({
            indexName: 'email-index',
            partitionKey: { name: 'email', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        this.challengesTable = new aws_dynamodb_1.Table(this, 'ChallengesTable', {
            tableName: `chme-${stage}-challenges`,
            partitionKey: { name: 'challengeId', type: aws_dynamodb_1.AttributeType.STRING },
            billingMode: aws_dynamodb_1.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
            removalPolicy,
        });
        // [MIGRATION STAGE 1] 기존 category-index를 일시적으로 유지 (Stage 2에서 삭제 예정)
        // DynamoDB는 UpdateTable 당 GSI 1개만 허용하므로 단계적 마이그레이션 필요
        this.challengesTable.addGlobalSecondaryIndex({
            indexName: 'category-index',
            partitionKey: { name: 'category', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        // GSI: 카테고리별 챌린지 목록 (challengeStartAt 기준 정렬) - Lambda list/index.ts 사용
        this.challengesTable.addGlobalSecondaryIndex({
            indexName: 'category-index-v2',
            partitionKey: { name: 'category', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'challengeStartAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        // NOTE: lifecycle-index는 Stage 2에서 추가 예정
        // (category-index 삭제 후 별도 deploy로 추가)
        this.userChallengesTable = new aws_dynamodb_1.Table(this, 'UserChallengesTable', {
            tableName: `chme-${stage}-user-challenges`,
            partitionKey: { name: 'userChallengeId', type: aws_dynamodb_1.AttributeType.STRING },
            billingMode: aws_dynamodb_1.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
            removalPolicy,
            stream: aws_dynamodb_1.StreamViewType.NEW_AND_OLD_IMAGES,
        });
        this.userChallengesTable.addGlobalSecondaryIndex({
            indexName: 'userId-index',
            partitionKey: { name: 'userId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'startDate', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        this.userChallengesTable.addGlobalSecondaryIndex({
            indexName: 'challengeId-index',
            partitionKey: { name: 'challengeId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'startDate', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        this.userChallengesTable.addGlobalSecondaryIndex({
            indexName: 'groupId-index',
            partitionKey: { name: 'groupId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'userId', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        this.verificationsTable = new aws_dynamodb_1.Table(this, 'VerificationsTable', {
            tableName: `chme-${stage}-verifications`,
            partitionKey: { name: 'verificationId', type: aws_dynamodb_1.AttributeType.STRING },
            billingMode: aws_dynamodb_1.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
            removalPolicy,
            stream: aws_dynamodb_1.StreamViewType.NEW_AND_OLD_IMAGES,
        });
        this.verificationsTable.addGlobalSecondaryIndex({
            indexName: 'userChallengeId-index',
            partitionKey: { name: 'userChallengeId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'day', type: aws_dynamodb_1.AttributeType.NUMBER },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        this.verificationsTable.addGlobalSecondaryIndex({
            indexName: 'userId-index',
            partitionKey: { name: 'userId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        this.cheersTable = new aws_dynamodb_1.Table(this, 'CheersTable', {
            tableName: `chme-${stage}-cheers`,
            partitionKey: { name: 'cheerId', type: aws_dynamodb_1.AttributeType.STRING },
            billingMode: aws_dynamodb_1.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
            removalPolicy,
        });
        this.cheersTable.addGlobalSecondaryIndex({
            indexName: 'receiverId-index',
            partitionKey: { name: 'receiverId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        this.cheersTable.addGlobalSecondaryIndex({
            indexName: 'senderId-index',
            partitionKey: { name: 'senderId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        this.cheersTable.addGlobalSecondaryIndex({
            indexName: 'scheduled-index',
            partitionKey: { name: 'status', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'scheduledTime', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        this.userCheerTicketsTable = new aws_dynamodb_1.Table(this, 'UserCheerTicketsTable', {
            tableName: `chme-${stage}-user-cheer-tickets`,
            partitionKey: { name: 'ticketId', type: aws_dynamodb_1.AttributeType.STRING },
            billingMode: aws_dynamodb_1.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
            removalPolicy,
            timeToLiveAttribute: 'expiresAtTimestamp',
        });
        this.userCheerTicketsTable.addGlobalSecondaryIndex({
            indexName: 'userId-status-index',
            partitionKey: { name: 'userId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'status', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        // ==================== Quest Board Tables ====================
        this.questsTable = new aws_dynamodb_1.Table(this, 'QuestsTable', {
            tableName: `chme-${stage}-quests`,
            partitionKey: { name: 'questId', type: aws_dynamodb_1.AttributeType.STRING },
            billingMode: aws_dynamodb_1.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
            removalPolicy,
        });
        // GSI: 챌린지별 퀘스트 목록
        this.questsTable.addGlobalSecondaryIndex({
            indexName: 'challengeId-index',
            partitionKey: { name: 'challengeId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        // GSI: 상태별 퀘스트 (active/inactive)
        this.questsTable.addGlobalSecondaryIndex({
            indexName: 'status-index',
            partitionKey: { name: 'status', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        // ------------------------------------------------------------------
        // questSubmissions: 전체 제출 이력 (append-only, 절대 삭제하지 않음)
        // ------------------------------------------------------------------
        this.questSubmissionsTable = new aws_dynamodb_1.Table(this, 'QuestSubmissionsTable', {
            tableName: `chme-${stage}-quest-submissions`,
            partitionKey: { name: 'submissionId', type: aws_dynamodb_1.AttributeType.STRING },
            billingMode: aws_dynamodb_1.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
            removalPolicy,
            stream: aws_dynamodb_1.StreamViewType.NEW_AND_OLD_IMAGES,
        });
        // GSI 1: 유저별 전체 제출 이력 (최신순)
        this.questSubmissionsTable.addGlobalSecondaryIndex({
            indexName: 'userId-createdAt-index',
            partitionKey: { name: 'userId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        // GSI 2: 퀘스트별 전체 이력 (관리자: 모든 시도 포함 조회)
        this.questSubmissionsTable.addGlobalSecondaryIndex({
            indexName: 'questId-createdAt-index',
            partitionKey: { name: 'questId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        // GSI 3: 관리자 pending 큐 (status별 시간순 처리)
        this.questSubmissionsTable.addGlobalSecondaryIndex({
            indexName: 'status-createdAt-index',
            partitionKey: { name: 'status', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        // ------------------------------------------------------------------
        // activeQuestSubmissions: 현재 유효한 제출 상태 (유니크 보장용)
        //   PK: activeSubmissionId = `${userId}#${questId}`
        //   - rejected → DELETE (재제출 허용)
        //   - approved / auto_approved → 유지 (재제출 차단)
        //   - ConditionalWrite로 중복 제출 원자적 방지
        // ------------------------------------------------------------------
        this.activeQuestSubmissionsTable = new aws_dynamodb_1.Table(this, 'ActiveQuestSubmissionsTable', {
            tableName: `chme-${stage}-active-quest-submissions`,
            partitionKey: { name: 'activeSubmissionId', type: aws_dynamodb_1.AttributeType.STRING },
            billingMode: aws_dynamodb_1.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
            removalPolicy,
        });
        // GSI: 퀘스트별 현재 pending/approved 현황 (관리자 대시보드용)
        this.activeQuestSubmissionsTable.addGlobalSecondaryIndex({
            indexName: 'questId-index',
            partitionKey: { name: 'questId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'updatedAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        // ==================== Bulletin Board Tables ====================
        this.bulletinPostsTable = new aws_dynamodb_1.Table(this, 'BulletinPostsTable', {
            tableName: `chme-${stage}-bulletin-posts`,
            partitionKey: { name: 'postId', type: aws_dynamodb_1.AttributeType.STRING },
            billingMode: aws_dynamodb_1.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
            removalPolicy,
        });
        // GSI: challengePhaseKey = `${challengeId}#${phase}` 로 게시판 피드 조회
        this.bulletinPostsTable.addGlobalSecondaryIndex({
            indexName: 'challengePhaseKey-index',
            partitionKey: { name: 'challengePhaseKey', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        // GSI: 유저별 포스트 조회
        this.bulletinPostsTable.addGlobalSecondaryIndex({
            indexName: 'userId-index',
            partitionKey: { name: 'userId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        this.bulletinCommentsTable = new aws_dynamodb_1.Table(this, 'BulletinCommentsTable', {
            tableName: `chme-${stage}-bulletin-comments`,
            partitionKey: { name: 'commentId', type: aws_dynamodb_1.AttributeType.STRING },
            billingMode: aws_dynamodb_1.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
            removalPolicy,
        });
        // GSI: 포스트별 댓글 목록
        this.bulletinCommentsTable.addGlobalSecondaryIndex({
            indexName: 'postId-index',
            partitionKey: { name: 'postId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.ALL,
        });
        // likeId = `${postId}#${userId}` → 유니크 보장 + 중복 방지
        this.bulletinLikesTable = new aws_dynamodb_1.Table(this, 'BulletinLikesTable', {
            tableName: `chme-${stage}-bulletin-likes`,
            partitionKey: { name: 'likeId', type: aws_dynamodb_1.AttributeType.STRING },
            billingMode: aws_dynamodb_1.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
            removalPolicy,
        });
        // GSI: 포스트별 좋아요 수 집계
        this.bulletinLikesTable.addGlobalSecondaryIndex({
            indexName: 'postId-index',
            partitionKey: { name: 'postId', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'createdAt', type: aws_dynamodb_1.AttributeType.STRING },
            projectionType: aws_dynamodb_1.ProjectionType.KEYS_ONLY,
        });
        // ==================== External Resources ====================
        this.uploadsBucket = aws_s3_1.Bucket.fromBucketName(this, 'Uploads', config.s3.uploadsBucket);
        this.snsTopic = new aws_sns_1.Topic(this, 'Topic');
        this.eventBus = new aws_events_1.EventBus(this, 'Bus');
    }
}
exports.CoreStack = CoreStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29yZS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvcmUtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsNkNBQStEO0FBRy9ELHlEQU1pQztBQUVqQywyREFNa0M7QUFFbEMsK0NBQXFEO0FBQ3JELGlEQUE0QztBQUM1Qyx1REFBa0Q7QUFPbEQsTUFBYSxTQUFVLFNBQVEsbUJBQUs7SUEwQmxDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBcUI7UUFDN0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFaEMsb0RBQW9EO1FBQ3BELElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxzQkFBUSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDN0MsWUFBWSxFQUFFLFNBQVMsS0FBSyxRQUFRO1lBQ3BDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsYUFBYSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtZQUM5QixVQUFVLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1lBQzNCLGVBQWUsRUFBRSw2QkFBZSxDQUFDLFVBQVU7WUFDM0MsR0FBRyxFQUFFLGlCQUFHLENBQUMsUUFBUTtZQUNqQixhQUFhLEVBQUUsMkJBQWEsQ0FBQyxPQUFPO1NBQ3JDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLEVBQUU7WUFDOUQsa0JBQWtCLEVBQUUsU0FBUyxLQUFLLFNBQVM7WUFDM0MsU0FBUyxFQUFFLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRTtTQUNsQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksOEJBQWdCLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUMzRCxV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LEVBQUUsb0JBQW9CLEVBQUU7WUFDOUQsU0FBUyxFQUFFLFFBQVEsS0FBSyxpQkFBaUI7WUFDekMsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsNEJBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDNUQsV0FBVyxFQUFFLDBCQUFXLENBQUMsZUFBZTtZQUN4QyxnQ0FBZ0MsRUFBRSxFQUFFLDBCQUEwQixFQUFFLE1BQU0sRUFBRTtZQUN4RSxhQUFhO1NBQ2QsQ0FBQyxDQUFDO1FBQ0gscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyx1QkFBdUIsQ0FBQztZQUM5QyxTQUFTLEVBQUUsY0FBYztZQUN6QixZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSw0QkFBYSxDQUFDLE1BQU0sRUFBRTtZQUM1RCxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSw0QkFBYSxDQUFDLE1BQU0sRUFBRTtZQUMxRCxjQUFjLEVBQUUsNkJBQWMsQ0FBQyxTQUFTO1NBQ3pDLENBQUMsQ0FBQztRQUVILCtEQUErRDtRQUMvRCxJQUFJLENBQUMsYUFBYSxHQUFHLGVBQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3JGLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxlQUFLLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxxQkFBUSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztJQUU1QyxDQUFDO0NBQ0Y7QUFsVUQsOEJBa1VDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU3RhY2ssIFN0YWNrUHJvcHMsIFJlbW92YWxQb2xpY3kgfSBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuaW1wb3J0IHtcclxuICBVc2VyUG9vbCxcclxuICBVc2VyUG9vbENsaWVudCxcclxuICBDZm5Vc2VyUG9vbEdyb3VwLFxyXG4gIEFjY291bnRSZWNvdmVyeSxcclxuICBNZmEsXHJcbn0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xyXG5cclxuaW1wb3J0IHtcclxuICBUYWJsZSxcclxuICBBdHRyaWJ1dGVUeXBlLFxyXG4gIEJpbGxpbmdNb2RlLFxyXG4gIFN0cmVhbVZpZXdUeXBlLFxyXG4gIFByb2plY3Rpb25UeXBlLFxyXG59IGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XHJcblxyXG5pbXBvcnQgeyBCdWNrZXQsIElCdWNrZXQgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xyXG5pbXBvcnQgeyBUb3BpYyB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xyXG5pbXBvcnQgeyBFdmVudEJ1cyB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBDb3JlU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xyXG4gIHN0YWdlOiBzdHJpbmc7XHJcbiAgY29uZmlnOiBhbnk7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBDb3JlU3RhY2sgZXh0ZW5kcyBTdGFjayB7XHJcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sOiBVc2VyUG9vbDtcclxuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2xDbGllbnQ6IFVzZXJQb29sQ2xpZW50O1xyXG4gIHB1YmxpYyByZWFkb25seSBhZG1pbnNHcm91cDogQ2ZuVXNlclBvb2xHcm91cDtcclxuXHJcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJzVGFibGU6IFRhYmxlO1xyXG4gIHB1YmxpYyByZWFkb25seSBjaGFsbGVuZ2VzVGFibGU6IFRhYmxlO1xyXG4gIHB1YmxpYyByZWFkb25seSB1c2VyQ2hhbGxlbmdlc1RhYmxlOiBUYWJsZTtcclxuICBwdWJsaWMgcmVhZG9ubHkgdmVyaWZpY2F0aW9uc1RhYmxlOiBUYWJsZTtcclxuICBwdWJsaWMgcmVhZG9ubHkgY2hlZXJzVGFibGU6IFRhYmxlO1xyXG4gIHB1YmxpYyByZWFkb25seSB1c2VyQ2hlZXJUaWNrZXRzVGFibGU6IFRhYmxlO1xyXG5cclxuICAvLyBRdWVzdCBib2FyZCB0YWJsZXNcclxuICBwdWJsaWMgcmVhZG9ubHkgcXVlc3RzVGFibGU6IFRhYmxlO1xyXG4gIHB1YmxpYyByZWFkb25seSBxdWVzdFN1Ym1pc3Npb25zVGFibGU6IFRhYmxlOyAgICAgICAgIC8vIOyghOyytCDsnbTroKUgKGFwcGVuZC1vbmx5KVxyXG4gIHB1YmxpYyByZWFkb25seSBhY3RpdmVRdWVzdFN1Ym1pc3Npb25zVGFibGU6IFRhYmxlOyAgLy8g7ZiE7J6sIOyDge2DnCArIOycoOuLiO2BrCDrs7TsnqVcclxuXHJcbiAgLy8gQnVsbGV0aW4gYm9hcmQgdGFibGVzXHJcbiAgcHVibGljIHJlYWRvbmx5IGJ1bGxldGluUG9zdHNUYWJsZTogVGFibGU7XHJcbiAgcHVibGljIHJlYWRvbmx5IGJ1bGxldGluQ29tbWVudHNUYWJsZTogVGFibGU7XHJcbiAgcHVibGljIHJlYWRvbmx5IGJ1bGxldGluTGlrZXNUYWJsZTogVGFibGU7XHJcblxyXG4gIHB1YmxpYyByZWFkb25seSB1cGxvYWRzQnVja2V0OiBJQnVja2V0O1xyXG4gIHB1YmxpYyByZWFkb25seSBzbnNUb3BpYzogVG9waWM7XHJcbiAgcHVibGljIHJlYWRvbmx5IGV2ZW50QnVzOiBFdmVudEJ1cztcclxuXHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IENvcmVTdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICBjb25zdCB7IHN0YWdlLCBjb25maWcgfSA9IHByb3BzO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09IENvZ25pdG8gPT09PT09PT09PT09PT09PT09PT1cclxuICAgIHRoaXMudXNlclBvb2wgPSBuZXcgVXNlclBvb2wodGhpcywgJ1VzZXJQb29sJywge1xyXG4gICAgICB1c2VyUG9vbE5hbWU6IGBjaHVtNy0ke3N0YWdlfS11c2Vyc2AsXHJcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxyXG4gICAgICBzaWduSW5BbGlhc2VzOiB7IGVtYWlsOiB0cnVlIH0sXHJcbiAgICAgIGF1dG9WZXJpZnk6IHsgZW1haWw6IHRydWUgfSxcclxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBBY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcclxuICAgICAgbWZhOiBNZmEuT1BUSU9OQUwsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMudXNlclBvb2xDbGllbnQgPSB0aGlzLnVzZXJQb29sLmFkZENsaWVudCgnVXNlclBvb2xDbGllbnQnLCB7XHJcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogYGNodW03LSR7c3RhZ2V9LWNsaWVudGAsXHJcbiAgICAgIGF1dGhGbG93czogeyB1c2VyUGFzc3dvcmQ6IHRydWUgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuYWRtaW5zR3JvdXAgPSBuZXcgQ2ZuVXNlclBvb2xHcm91cCh0aGlzLCAnQWRtaW5zR3JvdXAnLCB7XHJcbiAgICAgIHVzZXJQb29sSWQ6IHRoaXMudXNlclBvb2wudXNlclBvb2xJZCxcclxuICAgICAgZ3JvdXBOYW1lOiAnYWRtaW5zJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09IER5bmFtb0RCID09PT09PT09PT09PT09PT09PT09XHJcbiAgICBjb25zdCBpc1Byb2QgPSBzdGFnZSA9PT0gJ3Byb2QnO1xyXG4gICAgY29uc3QgcmVtb3ZhbFBvbGljeSA9IGlzUHJvZCA/IFJlbW92YWxQb2xpY3kuUkVUQUlOIDogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZO1xyXG5cclxuICAgIHRoaXMudXNlcnNUYWJsZSA9IG5ldyBUYWJsZSh0aGlzLCAnVXNlcnNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgY2htZS0ke3N0YWdlfS11c2Vyc2AsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndXNlcklkJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IEJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IGlzUHJvZCB9LFxyXG4gICAgICByZW1vdmFsUG9saWN5LFxyXG4gICAgICBzdHJlYW06IFN0cmVhbVZpZXdUeXBlLk5FV19BTkRfT0xEX0lNQUdFUyxcclxuICAgIH0pO1xyXG4gICAgdGhpcy51c2Vyc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnZW1haWwtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2VtYWlsJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IFByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuY2hhbGxlbmdlc1RhYmxlID0gbmV3IFRhYmxlKHRoaXMsICdDaGFsbGVuZ2VzVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogYGNobWUtJHtzdGFnZX0tY2hhbGxlbmdlc2AsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnY2hhbGxlbmdlSWQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogaXNQcm9kIH0sXHJcbiAgICAgIHJlbW92YWxQb2xpY3ksXHJcbiAgICB9KTtcclxuICAgIC8vIFtNSUdSQVRJT04gU1RBR0UgMV0g6riw7KG0IGNhdGVnb3J5LWluZGV466W8IOydvOyLnOyggeycvOuhnCDsnKDsp4AgKFN0YWdlIDLsl5DshJwg7IKt7KCcIOyYiOyglSlcclxuICAgIC8vIER5bmFtb0RC64qUIFVwZGF0ZVRhYmxlIOuLuSBHU0kgMeqwnOunjCDtl4jsmqntlZjrr4DroZwg64uo6rOE7KCBIOuniOydtOq3uOugiOydtOyFmCDtlYTsmpRcclxuICAgIHRoaXMuY2hhbGxlbmdlc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnY2F0ZWdvcnktaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2NhdGVnb3J5JywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAnY3JlYXRlZEF0JywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IFByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG4gICAgLy8gR1NJOiDsubTthYzqs6Drpqzrs4Qg7LGM66aw7KeAIOuqqeuhnSAoY2hhbGxlbmdlU3RhcnRBdCDquLDspIAg7KCV66CsKSAtIExhbWJkYSBsaXN0L2luZGV4LnRzIOyCrOyaqVxyXG4gICAgdGhpcy5jaGFsbGVuZ2VzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdjYXRlZ29yeS1pbmRleC12MicsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnY2F0ZWdvcnknLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdjaGFsbGVuZ2VTdGFydEF0JywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IFByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG4gICAgLy8gTk9URTogbGlmZWN5Y2xlLWluZGV464qUIFN0YWdlIDLsl5DshJwg7LaU6rCAIOyYiOyglVxyXG4gICAgLy8gKGNhdGVnb3J5LWluZGV4IOyCreygnCDtm4Qg67OE64+EIGRlcGxveeuhnCDstpTqsIApXHJcblxyXG4gICAgdGhpcy51c2VyQ2hhbGxlbmdlc1RhYmxlID0gbmV3IFRhYmxlKHRoaXMsICdVc2VyQ2hhbGxlbmdlc1RhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6IGBjaG1lLSR7c3RhZ2V9LXVzZXItY2hhbGxlbmdlc2AsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndXNlckNoYWxsZW5nZUlkJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IEJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IGlzUHJvZCB9LFxyXG4gICAgICByZW1vdmFsUG9saWN5LFxyXG4gICAgICBzdHJlYW06IFN0cmVhbVZpZXdUeXBlLk5FV19BTkRfT0xEX0lNQUdFUyxcclxuICAgIH0pO1xyXG4gICAgdGhpcy51c2VyQ2hhbGxlbmdlc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAndXNlcklkLWluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd1c2VySWQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdzdGFydERhdGUnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogUHJvamVjdGlvblR5cGUuQUxMLFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLnVzZXJDaGFsbGVuZ2VzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdjaGFsbGVuZ2VJZC1pbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnY2hhbGxlbmdlSWQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdzdGFydERhdGUnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogUHJvamVjdGlvblR5cGUuQUxMLFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLnVzZXJDaGFsbGVuZ2VzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdncm91cElkLWluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdncm91cElkJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAndXNlcklkJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IFByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMudmVyaWZpY2F0aW9uc1RhYmxlID0gbmV3IFRhYmxlKHRoaXMsICdWZXJpZmljYXRpb25zVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogYGNobWUtJHtzdGFnZX0tdmVyaWZpY2F0aW9uc2AsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndmVyaWZpY2F0aW9uSWQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogaXNQcm9kIH0sXHJcbiAgICAgIHJlbW92YWxQb2xpY3ksXHJcbiAgICAgIHN0cmVhbTogU3RyZWFtVmlld1R5cGUuTkVXX0FORF9PTERfSU1BR0VTLFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLnZlcmlmaWNhdGlvbnNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ3VzZXJDaGFsbGVuZ2VJZC1pbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndXNlckNoYWxsZW5nZUlkJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAnZGF5JywgdHlwZTogQXR0cmlidXRlVHlwZS5OVU1CRVIgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IFByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG4gICAgdGhpcy52ZXJpZmljYXRpb25zVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICd1c2VySWQtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3VzZXJJZCcsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ2NyZWF0ZWRBdCcsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHByb2plY3Rpb25UeXBlOiBQcm9qZWN0aW9uVHlwZS5BTEwsXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmNoZWVyc1RhYmxlID0gbmV3IFRhYmxlKHRoaXMsICdDaGVlcnNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgY2htZS0ke3N0YWdlfS1jaGVlcnNgLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2NoZWVySWQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogaXNQcm9kIH0sXHJcbiAgICAgIHJlbW92YWxQb2xpY3ksXHJcbiAgICB9KTtcclxuICAgIHRoaXMuY2hlZXJzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdyZWNlaXZlcklkLWluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdyZWNlaXZlcklkJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAnY3JlYXRlZEF0JywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IFByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG4gICAgdGhpcy5jaGVlcnNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ3NlbmRlcklkLWluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdzZW5kZXJJZCcsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ2NyZWF0ZWRBdCcsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHByb2plY3Rpb25UeXBlOiBQcm9qZWN0aW9uVHlwZS5BTEwsXHJcbiAgICB9KTtcclxuICAgIHRoaXMuY2hlZXJzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdzY2hlZHVsZWQtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3N0YXR1cycsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ3NjaGVkdWxlZFRpbWUnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogUHJvamVjdGlvblR5cGUuQUxMLFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy51c2VyQ2hlZXJUaWNrZXRzVGFibGUgPSBuZXcgVGFibGUodGhpcywgJ1VzZXJDaGVlclRpY2tldHNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgY2htZS0ke3N0YWdlfS11c2VyLWNoZWVyLXRpY2tldHNgLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3RpY2tldElkJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IEJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IGlzUHJvZCB9LFxyXG4gICAgICByZW1vdmFsUG9saWN5LFxyXG4gICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiAnZXhwaXJlc0F0VGltZXN0YW1wJyxcclxuICAgIH0pO1xyXG4gICAgdGhpcy51c2VyQ2hlZXJUaWNrZXRzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICd1c2VySWQtc3RhdHVzLWluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd1c2VySWQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdzdGF0dXMnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogUHJvamVjdGlvblR5cGUuQUxMLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT0gUXVlc3QgQm9hcmQgVGFibGVzID09PT09PT09PT09PT09PT09PT09XHJcbiAgICB0aGlzLnF1ZXN0c1RhYmxlID0gbmV3IFRhYmxlKHRoaXMsICdRdWVzdHNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgY2htZS0ke3N0YWdlfS1xdWVzdHNgLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3F1ZXN0SWQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogaXNQcm9kIH0sXHJcbiAgICAgIHJlbW92YWxQb2xpY3ksXHJcbiAgICB9KTtcclxuICAgIC8vIEdTSTog7LGM66aw7KeA67OEIO2AmOyKpO2KuCDrqqnroZ1cclxuICAgIHRoaXMucXVlc3RzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdjaGFsbGVuZ2VJZC1pbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnY2hhbGxlbmdlSWQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdjcmVhdGVkQXQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogUHJvamVjdGlvblR5cGUuQUxMLFxyXG4gICAgfSk7XHJcbiAgICAvLyBHU0k6IOyDge2DnOuzhCDtgJjsiqTtirggKGFjdGl2ZS9pbmFjdGl2ZSlcclxuICAgIHRoaXMucXVlc3RzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdzdGF0dXMtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3N0YXR1cycsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ2NyZWF0ZWRBdCcsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHByb2plY3Rpb25UeXBlOiBQcm9qZWN0aW9uVHlwZS5BTEwsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIC8vIHF1ZXN0U3VibWlzc2lvbnM6IOyghOyytCDsoJzstpwg7J2066ClIChhcHBlbmQtb25seSwg7KCI64yAIOyCreygnO2VmOyngCDslYrsnYwpXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIHRoaXMucXVlc3RTdWJtaXNzaW9uc1RhYmxlID0gbmV3IFRhYmxlKHRoaXMsICdRdWVzdFN1Ym1pc3Npb25zVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogYGNobWUtJHtzdGFnZX0tcXVlc3Qtc3VibWlzc2lvbnNgLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3N1Ym1pc3Npb25JZCcsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBCaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiBpc1Byb2QgfSxcclxuICAgICAgcmVtb3ZhbFBvbGljeSxcclxuICAgICAgc3RyZWFtOiBTdHJlYW1WaWV3VHlwZS5ORVdfQU5EX09MRF9JTUFHRVMsXHJcbiAgICB9KTtcclxuICAgIC8vIEdTSSAxOiDsnKDsoIDrs4Qg7KCE7LK0IOygnOy2nCDsnbTroKUgKOy1nOyLoOyInClcclxuICAgIHRoaXMucXVlc3RTdWJtaXNzaW9uc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAndXNlcklkLWNyZWF0ZWRBdC1pbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndXNlcklkJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAnY3JlYXRlZEF0JywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IFByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG4gICAgLy8gR1NJIDI6IO2AmOyKpO2KuOuzhCDsoITssrQg7J2066ClICjqtIDrpqzsnpA6IOuqqOuToCDsi5zrj4Qg7Y+s7ZWoIOyhsO2ajClcclxuICAgIHRoaXMucXVlc3RTdWJtaXNzaW9uc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAncXVlc3RJZC1jcmVhdGVkQXQtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3F1ZXN0SWQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdjcmVhdGVkQXQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogUHJvamVjdGlvblR5cGUuQUxMLFxyXG4gICAgfSk7XHJcbiAgICAvLyBHU0kgMzog6rSA66as7J6QIHBlbmRpbmcg7YGQIChzdGF0dXPrs4Qg7Iuc6rCE7IicIOyymOumrClcclxuICAgIHRoaXMucXVlc3RTdWJtaXNzaW9uc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnc3RhdHVzLWNyZWF0ZWRBdC1pbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnc3RhdHVzJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAnY3JlYXRlZEF0JywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IFByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgLy8gYWN0aXZlUXVlc3RTdWJtaXNzaW9uczog7ZiE7J6sIOycoO2aqO2VnCDsoJzstpwg7IOB7YOcICjsnKDri4jtgawg67O07J6l7JqpKVxyXG4gICAgLy8gICBQSzogYWN0aXZlU3VibWlzc2lvbklkID0gYCR7dXNlcklkfSMke3F1ZXN0SWR9YFxyXG4gICAgLy8gICAtIHJlamVjdGVkIOKGkiBERUxFVEUgKOyerOygnOy2nCDtl4jsmqkpXHJcbiAgICAvLyAgIC0gYXBwcm92ZWQgLyBhdXRvX2FwcHJvdmVkIOKGkiDsnKDsp4AgKOyerOygnOy2nCDssKjri6gpXHJcbiAgICAvLyAgIC0gQ29uZGl0aW9uYWxXcml0ZeuhnCDspJHrs7Ug7KCc7LacIOybkOyekOyggSDrsKnsp4BcclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgdGhpcy5hY3RpdmVRdWVzdFN1Ym1pc3Npb25zVGFibGUgPSBuZXcgVGFibGUodGhpcywgJ0FjdGl2ZVF1ZXN0U3VibWlzc2lvbnNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgY2htZS0ke3N0YWdlfS1hY3RpdmUtcXVlc3Qtc3VibWlzc2lvbnNgLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2FjdGl2ZVN1Ym1pc3Npb25JZCcsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBCaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7IHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiBpc1Byb2QgfSxcclxuICAgICAgcmVtb3ZhbFBvbGljeSxcclxuICAgIH0pO1xyXG4gICAgLy8gR1NJOiDtgJjsiqTtirjrs4Qg7ZiE7J6sIHBlbmRpbmcvYXBwcm92ZWQg7ZiE7ZmpICjqtIDrpqzsnpAg64yA7Iuc67O065Oc7JqpKVxyXG4gICAgdGhpcy5hY3RpdmVRdWVzdFN1Ym1pc3Npb25zVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdxdWVzdElkLWluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdxdWVzdElkJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAndXBkYXRlZEF0JywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IFByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09IEJ1bGxldGluIEJvYXJkIFRhYmxlcyA9PT09PT09PT09PT09PT09PT09PVxyXG4gICAgdGhpcy5idWxsZXRpblBvc3RzVGFibGUgPSBuZXcgVGFibGUodGhpcywgJ0J1bGxldGluUG9zdHNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgY2htZS0ke3N0YWdlfS1idWxsZXRpbi1wb3N0c2AsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAncG9zdElkJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IEJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IGlzUHJvZCB9LFxyXG4gICAgICByZW1vdmFsUG9saWN5LFxyXG4gICAgfSk7XHJcbiAgICAvLyBHU0k6IGNoYWxsZW5nZVBoYXNlS2V5ID0gYCR7Y2hhbGxlbmdlSWR9IyR7cGhhc2V9YCDroZwg6rKM7Iuc7YyQIO2UvOuTnCDsobDtmoxcclxuICAgIHRoaXMuYnVsbGV0aW5Qb3N0c1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnY2hhbGxlbmdlUGhhc2VLZXktaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2NoYWxsZW5nZVBoYXNlS2V5JywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAnY3JlYXRlZEF0JywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IFByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG4gICAgLy8gR1NJOiDsnKDsoIDrs4Qg7Y+s7Iqk7Yq4IOyhsO2ajFxyXG4gICAgdGhpcy5idWxsZXRpblBvc3RzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICd1c2VySWQtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3VzZXJJZCcsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ2NyZWF0ZWRBdCcsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHByb2plY3Rpb25UeXBlOiBQcm9qZWN0aW9uVHlwZS5BTEwsXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmJ1bGxldGluQ29tbWVudHNUYWJsZSA9IG5ldyBUYWJsZSh0aGlzLCAnQnVsbGV0aW5Db21tZW50c1RhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6IGBjaG1lLSR7c3RhZ2V9LWJ1bGxldGluLWNvbW1lbnRzYCxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdjb21tZW50SWQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjogeyBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogaXNQcm9kIH0sXHJcbiAgICAgIHJlbW92YWxQb2xpY3ksXHJcbiAgICB9KTtcclxuICAgIC8vIEdTSTog7Y+s7Iqk7Yq467OEIOuMk+q4gCDrqqnroZ1cclxuICAgIHRoaXMuYnVsbGV0aW5Db21tZW50c1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAncG9zdElkLWluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdwb3N0SWQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdjcmVhdGVkQXQnLCB0eXBlOiBBdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogUHJvamVjdGlvblR5cGUuQUxMLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gbGlrZUlkID0gYCR7cG9zdElkfSMke3VzZXJJZH1gIOKGkiDsnKDri4jtgawg67O07J6lICsg7KSR67O1IOuwqeyngFxyXG4gICAgdGhpcy5idWxsZXRpbkxpa2VzVGFibGUgPSBuZXcgVGFibGUodGhpcywgJ0J1bGxldGluTGlrZXNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgY2htZS0ke3N0YWdlfS1idWxsZXRpbi1saWtlc2AsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnbGlrZUlkJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IEJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IGlzUHJvZCB9LFxyXG4gICAgICByZW1vdmFsUG9saWN5LFxyXG4gICAgfSk7XHJcbiAgICAvLyBHU0k6IO2PrOyKpO2KuOuzhCDsoovslYTsmpQg7IiYIOynkeqzhFxyXG4gICAgdGhpcy5idWxsZXRpbkxpa2VzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdwb3N0SWQtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3Bvc3RJZCcsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ2NyZWF0ZWRBdCcsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHByb2plY3Rpb25UeXBlOiBQcm9qZWN0aW9uVHlwZS5LRVlTX09OTFksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PSBFeHRlcm5hbCBSZXNvdXJjZXMgPT09PT09PT09PT09PT09PT09PT1cclxuICAgIHRoaXMudXBsb2Fkc0J1Y2tldCA9IEJ1Y2tldC5mcm9tQnVja2V0TmFtZSh0aGlzLCAnVXBsb2FkcycsIGNvbmZpZy5zMy51cGxvYWRzQnVja2V0KTtcclxuICAgIHRoaXMuc25zVG9waWMgPSBuZXcgVG9waWModGhpcywgJ1RvcGljJyk7XHJcbiAgICB0aGlzLmV2ZW50QnVzID0gbmV3IEV2ZW50QnVzKHRoaXMsICdCdXMnKTtcclxuXHJcbiAgfVxyXG59Il19