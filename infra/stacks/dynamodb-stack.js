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
exports.DynamoDBStack = void 0;
// infra/stacks/dynamodb-stack.ts
const aws_cdk_lib_1 = require("aws-cdk-lib");
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
class DynamoDBStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { config } = props;
        const { stage } = config;
        // ==========================================
        // 1. Users 테이블
        // ==========================================
        this.usersTable = new dynamodb.Table(this, 'UsersTable', {
            tableName: `chme-${stage}-users`,
            partitionKey: {
                name: 'userId',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: stage === 'prod',
            removalPolicy: stage === 'prod'
                ? aws_cdk_lib_1.RemovalPolicy.RETAIN
                : aws_cdk_lib_1.RemovalPolicy.DESTROY,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
        });
        // GSI: email로 사용자 조회
        this.usersTable.addGlobalSecondaryIndex({
            indexName: 'email-index',
            partitionKey: {
                name: 'email',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // ==========================================
        // 2. Challenges 테이블
        // ==========================================
        this.challengesTable = new dynamodb.Table(this, 'ChallengesTableV2', {
            tableName: `chme-${stage}-challenges`,
            partitionKey: {
                name: 'challengeId',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: stage === 'prod',
            removalPolicy: stage === 'prod'
                ? aws_cdk_lib_1.RemovalPolicy.RETAIN
                : aws_cdk_lib_1.RemovalPolicy.DESTROY
        });
        // GSI: category별 챌린지 조회 (endDate 정렬)
        this.challengesTable.addGlobalSecondaryIndex({
            indexName: 'category-index-v2',
            partitionKey: {
                name: 'category',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'endDate',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // GSI: lifecycle 상태별 챌린지 조회
        this.challengesTable.addGlobalSecondaryIndex({
            indexName: 'lifecycle-index',
            partitionKey: {
                name: 'lifecycle',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'endDate',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // ==========================================
        // 3. UserChallenges 테이블
        // ==========================================
        this.userChallengesTable = new dynamodb.Table(this, 'UserChallengesTable', {
            tableName: `chme-${stage}-user-challenges`,
            partitionKey: {
                name: 'userChallengeId',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: stage === 'prod',
            removalPolicy: stage === 'prod'
                ? aws_cdk_lib_1.RemovalPolicy.RETAIN
                : aws_cdk_lib_1.RemovalPolicy.DESTROY,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
        });
        // GSI: userId로 사용자의 챌린지 조회
        this.userChallengesTable.addGlobalSecondaryIndex({
            indexName: 'userId-index',
            partitionKey: {
                name: 'userId',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'startDate',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // GSI: groupId로 같은 그룹 멤버 조회 (스마트 응원용)
        this.userChallengesTable.addGlobalSecondaryIndex({
            indexName: 'groupId-index',
            partitionKey: {
                name: 'groupId',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'userId',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // GSI: challengeId로 특정 챌린지 참가자 조회
        this.userChallengesTable.addGlobalSecondaryIndex({
            indexName: 'challengeId-index',
            partitionKey: {
                name: 'challengeId',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'startDate',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // ==========================================
        // 4. Verifications 테이블
        // ==========================================
        this.verificationsTable = new dynamodb.Table(this, 'VerificationsTable', {
            tableName: `chme-${stage}-verifications`,
            partitionKey: {
                name: 'verificationId',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: stage === 'prod',
            removalPolicy: stage === 'prod'
                ? aws_cdk_lib_1.RemovalPolicy.RETAIN
                : aws_cdk_lib_1.RemovalPolicy.DESTROY,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
        });
        // GSI: userChallengeId로 특정 챌린지의 인증 조회
        this.verificationsTable.addGlobalSecondaryIndex({
            indexName: 'userChallengeId-index',
            partitionKey: {
                name: 'userChallengeId',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'day',
                type: dynamodb.AttributeType.NUMBER
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // GSI: userId로 사용자의 모든 인증 조회
        this.verificationsTable.addGlobalSecondaryIndex({
            indexName: 'userId-index',
            partitionKey: {
                name: 'userId',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'createdAt',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // GSI: 공개 인증 피드용
        this.verificationsTable.addGlobalSecondaryIndex({
            indexName: 'public-feed-index',
            partitionKey: {
                name: 'isPublic',
                type: dynamodb.AttributeType.STRING // 'true' or 'false'
            },
            sortKey: {
                name: 'createdAt',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // ==========================================
        // 5. Cheers 테이블 (스마트 응원)
        // ==========================================
        this.cheersTable = new dynamodb.Table(this, 'CheersTable', {
            tableName: `chme-${stage}-cheers`,
            partitionKey: {
                name: 'cheerId',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: stage === 'prod',
            removalPolicy: stage === 'prod'
                ? aws_cdk_lib_1.RemovalPolicy.RETAIN
                : aws_cdk_lib_1.RemovalPolicy.DESTROY,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
        });
        // GSI: senderId로 보낸 응원 조회
        this.cheersTable.addGlobalSecondaryIndex({
            indexName: 'senderId-index',
            partitionKey: {
                name: 'senderId',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'createdAt',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // GSI: receiverId로 받은 응원 조회
        this.cheersTable.addGlobalSecondaryIndex({
            indexName: 'receiverId-index',
            partitionKey: {
                name: 'receiverId',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'createdAt',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // GSI: 예약 응원 조회 (scheduledTime으로)
        this.cheersTable.addGlobalSecondaryIndex({
            indexName: 'scheduled-index',
            partitionKey: {
                name: 'status',
                type: dynamodb.AttributeType.STRING // 'pending', 'sent', 'failed'
            },
            sortKey: {
                name: 'scheduledTime',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // ==========================================
        // 6. UserCheerTickets 테이블 (응원권)
        // ==========================================
        this.userCheerTicketsTable = new dynamodb.Table(this, 'UserCheerTicketsTable', {
            tableName: `chme-${stage}-user-cheer-tickets`,
            partitionKey: {
                name: 'ticketId',
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: stage === 'prod',
            removalPolicy: stage === 'prod'
                ? aws_cdk_lib_1.RemovalPolicy.RETAIN
                : aws_cdk_lib_1.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'expiresAtTimestamp' // 자동 삭제
        });
        // GSI: userId로 사용자의 응원권 조회
        this.userCheerTicketsTable.addGlobalSecondaryIndex({
            indexName: 'userId-status-index',
            partitionKey: {
                name: 'userId',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'status',
                type: dynamodb.AttributeType.STRING // 'available', 'used', 'expired'
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // GSI: 만료 예정 응원권 조회
        this.userCheerTicketsTable.addGlobalSecondaryIndex({
            indexName: 'status-expires-index',
            partitionKey: {
                name: 'status',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: 'expiresAt',
                type: dynamodb.AttributeType.STRING
            },
            projectionType: dynamodb.ProjectionType.ALL
        });
        // ==========================================
        // Outputs
        // ==========================================
        new aws_cdk_lib_1.CfnOutput(this, 'UsersTableName', {
            value: this.usersTable.tableName,
            exportName: `chme-${stage}-users-table-name`
        });
        new aws_cdk_lib_1.CfnOutput(this, 'ChallengesTableName', {
            value: this.challengesTable.tableName,
            exportName: `chme-${stage}-challenges-table-name`
        });
        new aws_cdk_lib_1.CfnOutput(this, 'UserChallengesTableName', {
            value: this.userChallengesTable.tableName,
            exportName: `chme-${stage}-user-challenges-table-name`
        });
        new aws_cdk_lib_1.CfnOutput(this, 'VerificationsTableName', {
            value: this.verificationsTable.tableName,
            exportName: `chme-${stage}-verifications-table-name`
        });
        new aws_cdk_lib_1.CfnOutput(this, 'CheersTableName', {
            value: this.cheersTable.tableName,
            exportName: `chme-${stage}-cheers-table-name`
        });
        new aws_cdk_lib_1.CfnOutput(this, 'UserCheerTicketsTableName', {
            value: this.userCheerTicketsTable.tableName,
            exportName: `chme-${stage}-user-cheer-tickets-table-name`
        });
    }
}
exports.DynamoDBStack = DynamoDBStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHluYW1vZGItc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkeW5hbW9kYi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlDQUFpQztBQUNqQyw2Q0FLcUI7QUFFckIsbUVBQXFEO0FBT3JELE1BQWEsYUFBYyxTQUFRLG1CQUFLO0lBUXRDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQztRQUN6QixNQUFNLEVBQUUsS0FBSyxFQUFFLEdBQUcsTUFBTSxDQUFDO1FBRXpCLDZDQUE2QztRQUM3QyxlQUFlO1FBQ2YsNkNBQTZDO1FBQzdDLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDdkQsU0FBUyxFQUFFLFFBQVEsS0FBSyxRQUFRO1lBQ2hDLFlBQVksRUFBRTtnQkFDWixJQUFJLEVBQUUsUUFBUTtnQkFDZCxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNO2FBQ3BDO1lBQ0QsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLENBQUMsZUFBZTtZQUNqRCxtQkFBbUIsRUFBRSxLQUFLLEtBQUssTUFBTTtZQUNyQyxhQUFhLEVBQUUsS0FBSyxLQUFLLE1BQU07Z0JBQzdCLENBQUMsQ0FBQywyQkFBYSxDQUFDLE1BQU07Z0JBQ3RCLENBQUMsQ0FBQywyQkFBYSxDQUFDLE9BQU87WUFDekIsTUFBTSxFQUFFLFFBQVEsQ0FBQyxjQUFjLENBQUMsa0JBQWtCO1NBQ25ELENBQUMsQ0FBQztRQUVILHFCQUFxQjtRQUNyQixJQUFJLENBQUMsVUFBVSxDQUFDLHVCQUF1QixDQUFDO1lBQ3RDLFNBQVMsRUFBRSxhQUFhO1lBQ3hC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LXN0YWNrLnRzXHJcbmltcG9ydCB7XHJcbiAgU3RhY2ssXHJcbiAgU3RhY2tQcm9wcyxcclxuICBSZW1vdmFsUG9saWN5LFxyXG4gIENmbk91dHB1dFxyXG59IGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XHJcbmltcG9ydCB7IEluZnJhQ29uZmlnIH0gZnJvbSAnLi4vY29uZmlnJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRHluYW1vREJTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XHJcbiAgY29uZmlnOiBJbmZyYUNvbmZpZztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIER5bmFtb0RCU3RhY2sgZXh0ZW5kcyBTdGFjayB7XHJcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIHB1YmxpYyByZWFkb25seSBjaGFsbGVuZ2VzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIHB1YmxpYyByZWFkb25seSB1c2VyQ2hhbGxlbmdlc1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcclxuICBwdWJsaWMgcmVhZG9ubHkgdmVyaWZpY2F0aW9uc1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcclxuICBwdWJsaWMgcmVhZG9ubHkgY2hlZXJzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIHB1YmxpYyByZWFkb25seSB1c2VyQ2hlZXJUaWNrZXRzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRHluYW1vREJTdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICBjb25zdCB7IGNvbmZpZyB9ID0gcHJvcHM7XHJcbiAgICBjb25zdCB7IHN0YWdlIH0gPSBjb25maWc7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyAxLiBVc2VycyDthYzsnbTruJRcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgdGhpcy51c2Vyc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdVc2Vyc1RhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6IGBjaG1lLSR7c3RhZ2V9LXVzZXJzYCxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IFxyXG4gICAgICAgIG5hbWU6ICd1c2VySWQnLCBcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyBcclxuICAgICAgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogc3RhZ2UgPT09ICdwcm9kJyxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogc3RhZ2UgPT09ICdwcm9kJ1xyXG4gICAgICAgID8gUmVtb3ZhbFBvbGljeS5SRVRBSU5cclxuICAgICAgICA6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgICAgc3RyZWFtOiBkeW5hbW9kYi5TdHJlYW1WaWV3VHlwZS5ORVdfQU5EX09MRF9JTUFHRVNcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdTSTogZW1haWzroZwg7IKs7Jqp7J6QIOyhsO2ajFxyXG4gICAgdGhpcy51c2Vyc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnZW1haWwtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgXHJcbiAgICAgICAgbmFtZTogJ2VtYWlsJywgXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgXHJcbiAgICAgIH0sXHJcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTExcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gMi4gQ2hhbGxlbmdlcyDthYzsnbTruJRcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgdGhpcy5jaGFsbGVuZ2VzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0NoYWxsZW5nZXNUYWJsZVYyJywge1xyXG4gICAgICB0YWJsZU5hbWU6IGBjaG1lLSR7c3RhZ2V9LWNoYWxsZW5nZXNgLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcclxuICAgICAgICBuYW1lOiAnY2hhbGxlbmdlSWQnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HXHJcbiAgICAgIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHN0YWdlID09PSAncHJvZCcsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IHN0YWdlID09PSAncHJvZCdcclxuICAgICAgICA/IFJlbW92YWxQb2xpY3kuUkVUQUlOXHJcbiAgICAgICAgOiBSZW1vdmFsUG9saWN5LkRFU1RST1lcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdTSTogY2F0ZWdvcnnrs4Qg7LGM66aw7KeAIOyhsO2ajCAoZW5kRGF0ZSDsoJXroKwpXHJcbiAgICB0aGlzLmNoYWxsZW5nZXNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ2NhdGVnb3J5LWluZGV4LXYyJyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ2NhdGVnb3J5JyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklOR1xyXG4gICAgICB9LFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ2VuZERhdGUnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HXHJcbiAgICAgIH0sXHJcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTExcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdTSTogbGlmZWN5Y2xlIOyDge2DnOuzhCDssYzrprDsp4Ag7KGw7ZqMXHJcbiAgICB0aGlzLmNoYWxsZW5nZXNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ2xpZmVjeWNsZS1pbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdsaWZlY3ljbGUnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HXHJcbiAgICAgIH0sXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiAnZW5kRGF0ZScsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkdcclxuICAgICAgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyAzLiBVc2VyQ2hhbGxlbmdlcyDthYzsnbTruJRcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgdGhpcy51c2VyQ2hhbGxlbmdlc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdVc2VyQ2hhbGxlbmdlc1RhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6IGBjaG1lLSR7c3RhZ2V9LXVzZXItY2hhbGxlbmdlc2AsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBcclxuICAgICAgICBuYW1lOiAndXNlckNoYWxsZW5nZUlkJywgXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgXHJcbiAgICAgIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHN0YWdlID09PSAncHJvZCcsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IHN0YWdlID09PSAncHJvZCdcclxuICAgICAgICA/IFJlbW92YWxQb2xpY3kuUkVUQUlOXHJcbiAgICAgICAgOiBSZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICAgIHN0cmVhbTogZHluYW1vZGIuU3RyZWFtVmlld1R5cGUuTkVXX0FORF9PTERfSU1BR0VTXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHU0k6IHVzZXJJZOuhnCDsgqzsmqnsnpDsnZgg7LGM66aw7KeAIOyhsO2ajFxyXG4gICAgdGhpcy51c2VyQ2hhbGxlbmdlc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAndXNlcklkLWluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IFxyXG4gICAgICAgIG5hbWU6ICd1c2VySWQnLCBcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyBcclxuICAgICAgfSxcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6ICdzdGFydERhdGUnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HXHJcbiAgICAgIH0sXHJcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTExcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdTSTogZ3JvdXBJZOuhnCDqsJnsnYAg6re466O5IOuppOuyhCDsobDtmowgKOyKpOuniO2KuCDsnZHsm5DsmqkpXHJcbiAgICB0aGlzLnVzZXJDaGFsbGVuZ2VzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdncm91cElkLWluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IFxyXG4gICAgICAgIG5hbWU6ICdncm91cElkJywgXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgXHJcbiAgICAgIH0sXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiAndXNlcklkJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklOR1xyXG4gICAgICB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHU0k6IGNoYWxsZW5nZUlk66GcIO2KueyglSDssYzrprDsp4Ag7LC46rCA7J6QIOyhsO2ajFxyXG4gICAgdGhpcy51c2VyQ2hhbGxlbmdlc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnY2hhbGxlbmdlSWQtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgXHJcbiAgICAgICAgbmFtZTogJ2NoYWxsZW5nZUlkJywgXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgXHJcbiAgICAgIH0sXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiAnc3RhcnREYXRlJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklOR1xyXG4gICAgICB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIDQuIFZlcmlmaWNhdGlvbnMg7YWM7J2067iUXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIHRoaXMudmVyaWZpY2F0aW9uc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdWZXJpZmljYXRpb25zVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogYGNobWUtJHtzdGFnZX0tdmVyaWZpY2F0aW9uc2AsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBcclxuICAgICAgICBuYW1lOiAndmVyaWZpY2F0aW9uSWQnLCBcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyBcclxuICAgICAgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogc3RhZ2UgPT09ICdwcm9kJyxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogc3RhZ2UgPT09ICdwcm9kJ1xyXG4gICAgICAgID8gUmVtb3ZhbFBvbGljeS5SRVRBSU5cclxuICAgICAgICA6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgICAgc3RyZWFtOiBkeW5hbW9kYi5TdHJlYW1WaWV3VHlwZS5ORVdfQU5EX09MRF9JTUFHRVNcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdTSTogdXNlckNoYWxsZW5nZUlk66GcIO2KueyglSDssYzrprDsp4DsnZgg7J247KadIOyhsO2ajFxyXG4gICAgdGhpcy52ZXJpZmljYXRpb25zVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICd1c2VyQ2hhbGxlbmdlSWQtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgXHJcbiAgICAgICAgbmFtZTogJ3VzZXJDaGFsbGVuZ2VJZCcsIFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIFxyXG4gICAgICB9LFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ2RheScsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5OVU1CRVJcclxuICAgICAgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR1NJOiB1c2VySWTroZwg7IKs7Jqp7J6Q7J2YIOuqqOuToCDsnbjspp0g7KGw7ZqMXHJcbiAgICB0aGlzLnZlcmlmaWNhdGlvbnNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ3VzZXJJZC1pbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBcclxuICAgICAgICBuYW1lOiAndXNlcklkJywgXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgXHJcbiAgICAgIH0sXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiAnY3JlYXRlZEF0JyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklOR1xyXG4gICAgICB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHU0k6IOqzteqwnCDsnbjspp0g7ZS865Oc7JqpXHJcbiAgICB0aGlzLnZlcmlmaWNhdGlvbnNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ3B1YmxpYy1mZWVkLWluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IFxyXG4gICAgICAgIG5hbWU6ICdpc1B1YmxpYycsIFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIC8vICd0cnVlJyBvciAnZmFsc2UnXHJcbiAgICAgIH0sXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiAnY3JlYXRlZEF0JyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklOR1xyXG4gICAgICB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIDUuIENoZWVycyDthYzsnbTruJQgKOyKpOuniO2KuCDsnZHsm5ApXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIHRoaXMuY2hlZXJzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0NoZWVyc1RhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6IGBjaG1lLSR7c3RhZ2V9LWNoZWVyc2AsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBcclxuICAgICAgICBuYW1lOiAnY2hlZXJJZCcsIFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIFxyXG4gICAgICB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiBzdGFnZSA9PT0gJ3Byb2QnLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBzdGFnZSA9PT0gJ3Byb2QnXHJcbiAgICAgICAgPyBSZW1vdmFsUG9saWN5LlJFVEFJTlxyXG4gICAgICAgIDogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgICBzdHJlYW06IGR5bmFtb2RiLlN0cmVhbVZpZXdUeXBlLk5FV19BTkRfT0xEX0lNQUdFU1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR1NJOiBzZW5kZXJJZOuhnCDrs7Trgrgg7J2R7JuQIOyhsO2ajFxyXG4gICAgdGhpcy5jaGVlcnNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ3NlbmRlcklkLWluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IFxyXG4gICAgICAgIG5hbWU6ICdzZW5kZXJJZCcsIFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIFxyXG4gICAgICB9LFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ2NyZWF0ZWRBdCcsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkdcclxuICAgICAgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR1NJOiByZWNlaXZlcklk66GcIOuwm+ydgCDsnZHsm5Ag7KGw7ZqMXHJcbiAgICB0aGlzLmNoZWVyc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAncmVjZWl2ZXJJZC1pbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBcclxuICAgICAgICBuYW1lOiAncmVjZWl2ZXJJZCcsIFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIFxyXG4gICAgICB9LFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ2NyZWF0ZWRBdCcsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkdcclxuICAgICAgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gR1NJOiDsmIjslb0g7J2R7JuQIOyhsO2ajCAoc2NoZWR1bGVkVGltZeycvOuhnClcclxuICAgIHRoaXMuY2hlZXJzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdzY2hlZHVsZWQtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgXHJcbiAgICAgICAgbmFtZTogJ3N0YXR1cycsIFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIC8vICdwZW5kaW5nJywgJ3NlbnQnLCAnZmFpbGVkJ1xyXG4gICAgICB9LFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ3NjaGVkdWxlZFRpbWUnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HXHJcbiAgICAgIH0sXHJcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTExcclxuICAgIH0pO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gNi4gVXNlckNoZWVyVGlja2V0cyDthYzsnbTruJQgKOydkeybkOq2jClcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgdGhpcy51c2VyQ2hlZXJUaWNrZXRzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1VzZXJDaGVlclRpY2tldHNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgY2htZS0ke3N0YWdlfS11c2VyLWNoZWVyLXRpY2tldHNgLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgXHJcbiAgICAgICAgbmFtZTogJ3RpY2tldElkJywgXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgXHJcbiAgICAgIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHN0YWdlID09PSAncHJvZCcsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IHN0YWdlID09PSAncHJvZCdcclxuICAgICAgICA/IFJlbW92YWxQb2xpY3kuUkVUQUlOXHJcbiAgICAgICAgOiBSZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICAgIHRpbWVUb0xpdmVBdHRyaWJ1dGU6ICdleHBpcmVzQXRUaW1lc3RhbXAnIC8vIOyekOuPmSDsgq3soJxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdTSTogdXNlcklk66GcIOyCrOyaqeyekOydmCDsnZHsm5Dqtowg7KGw7ZqMXHJcbiAgICB0aGlzLnVzZXJDaGVlclRpY2tldHNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ3VzZXJJZC1zdGF0dXMtaW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgXHJcbiAgICAgICAgbmFtZTogJ3VzZXJJZCcsIFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIFxyXG4gICAgICB9LFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ3N0YXR1cycsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgLy8gJ2F2YWlsYWJsZScsICd1c2VkJywgJ2V4cGlyZWQnXHJcbiAgICAgIH0sXHJcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTExcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdTSTog66eM66OMIOyYiOyglSDsnZHsm5Dqtowg7KGw7ZqMXHJcbiAgICB0aGlzLnVzZXJDaGVlclRpY2tldHNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ3N0YXR1cy1leHBpcmVzLWluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IFxyXG4gICAgICAgIG5hbWU6ICdzdGF0dXMnLCBcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklOR1xyXG4gICAgICB9LFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ2V4cGlyZXNBdCcsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkdcclxuICAgICAgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBPdXRwdXRzXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1VzZXJzVGFibGVOYW1lJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy51c2Vyc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgZXhwb3J0TmFtZTogYGNobWUtJHtzdGFnZX0tdXNlcnMtdGFibGUtbmFtZWBcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0NoYWxsZW5nZXNUYWJsZU5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmNoYWxsZW5nZXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIGV4cG9ydE5hbWU6IGBjaG1lLSR7c3RhZ2V9LWNoYWxsZW5nZXMtdGFibGUtbmFtZWBcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1VzZXJDaGFsbGVuZ2VzVGFibGVOYW1lJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy51c2VyQ2hhbGxlbmdlc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgZXhwb3J0TmFtZTogYGNobWUtJHtzdGFnZX0tdXNlci1jaGFsbGVuZ2VzLXRhYmxlLW5hbWVgXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdWZXJpZmljYXRpb25zVGFibGVOYW1lJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy52ZXJpZmljYXRpb25zVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBleHBvcnROYW1lOiBgY2htZS0ke3N0YWdlfS12ZXJpZmljYXRpb25zLXRhYmxlLW5hbWVgXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdDaGVlcnNUYWJsZU5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmNoZWVyc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgZXhwb3J0TmFtZTogYGNobWUtJHtzdGFnZX0tY2hlZXJzLXRhYmxlLW5hbWVgXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdVc2VyQ2hlZXJUaWNrZXRzVGFibGVOYW1lJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy51c2VyQ2hlZXJUaWNrZXRzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBleHBvcnROYW1lOiBgY2htZS0ke3N0YWdlfS11c2VyLWNoZWVyLXRpY2tldHMtdGFibGUtbmFtZWBcclxuICAgIH0pO1xyXG4gIH1cclxufSJdfQ==