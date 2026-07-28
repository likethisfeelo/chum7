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
exports.BulletinStack = void 0;
/**
 * Bulletin Stack
 *
 * 챌린지 준비/진행 단계 게시판 API:
 *   POST   /bulletin/{challengeId}/posts                        - 글 작성
 *   GET    /bulletin/{challengeId}/posts?phase=preparing        - 글 목록
 *   POST   /bulletin/{challengeId}/posts/{postId}/like          - 좋아요 토글
 *   POST   /bulletin/{challengeId}/posts/{postId}/comments      - 댓글 작성
 *   GET    /bulletin/{challengeId}/posts/{postId}/comments      - 댓글 목록
 */
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_apigatewayv2_1 = require("aws-cdk-lib/aws-apigatewayv2");
const aws_apigatewayv2_integrations_1 = require("aws-cdk-lib/aws-apigatewayv2-integrations");
const aws_lambda_nodejs_1 = require("aws-cdk-lib/aws-lambda-nodejs");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const path = __importStar(require("path"));
class BulletinStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage, apiGateway, authorizer, bulletinPostsTable, bulletinCommentsTable, bulletinLikesTable, challengesTable, userChallengesTable, } = props;
        const commonEnv = {
            STAGE: stage,
            BULLETIN_POSTS_TABLE: bulletinPostsTable.tableName,
            BULLETIN_COMMENTS_TABLE: bulletinCommentsTable.tableName,
            BULLETIN_LIKES_TABLE: bulletinLikesTable.tableName,
            CHALLENGES_TABLE: challengesTable.tableName,
            USER_CHALLENGES_TABLE: userChallengesTable.tableName,
        };
        const commonProps = {
            runtime: aws_lambda_1.Runtime.NODEJS_20_X,
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            memorySize: 256,
            bundling: {
                minify: true,
                sourceMap: stage === 'dev',
                externalModules: ['@aws-sdk/*'],
            },
        };
        // 1. Create Post
        const createPostFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'CreatePostFn', {
            ...commonProps,
            functionName: `chme-${stage}-bulletin-create-post`,
            entry: path.join(__dirname, '../../backend/services/bulletin/create-post/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        bulletinPostsTable.grantWriteData(createPostFn);
        challengesTable.grantReadData(createPostFn);
        userChallengesTable.grantReadData(createPostFn);
        apiGateway.addRoutes({
            path: '/bulletin/{challengeId}/posts',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('CreatePostIntegration', createPostFn),
            authorizer,
        });
        // 2. List Posts (protected)
        const listPostsFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'ListPostsFn', {
            ...commonProps,
            functionName: `chme-${stage}-bulletin-list-posts`,
            entry: path.join(__dirname, '../../backend/services/bulletin/list-posts/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        bulletinPostsTable.grantReadData(listPostsFn);
        apiGateway.addRoutes({
            path: '/bulletin/{challengeId}/posts',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('ListPostsIntegration', listPostsFn),
            authorizer,
        });
        // 3. Like Post (toggle) (protected)
        const likePostFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'LikePostFn', {
            ...commonProps,
            functionName: `chme-${stage}-bulletin-like-post`,
            entry: path.join(__dirname, '../../backend/services/bulletin/like-post/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        bulletinPostsTable.grantReadWriteData(likePostFn);
        bulletinLikesTable.grantReadWriteData(likePostFn);
        apiGateway.addRoutes({
            path: '/bulletin/{challengeId}/posts/{postId}/like',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('LikePostIntegration', likePostFn),
            authorizer,
        });
        // 4. Create Comment (protected)
        const createCommentFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'CreateCommentFn', {
            ...commonProps,
            functionName: `chme-${stage}-bulletin-create-comment`,
            entry: path.join(__dirname, '../../backend/services/bulletin/create-comment/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        bulletinPostsTable.grantReadWriteData(createCommentFn);
        bulletinCommentsTable.grantWriteData(createCommentFn);
        apiGateway.addRoutes({
            path: '/bulletin/{challengeId}/posts/{postId}/comments',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('CreateCommentIntegration', createCommentFn),
            authorizer,
        });
        // 5. List Comments (protected)
        const listCommentsFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'ListCommentsFn', {
            ...commonProps,
            functionName: `chme-${stage}-bulletin-list-comments`,
            entry: path.join(__dirname, '../../backend/services/bulletin/list-comments/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        bulletinCommentsTable.grantReadData(listCommentsFn);
        apiGateway.addRoutes({
            path: '/bulletin/{challengeId}/posts/{postId}/comments',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('ListCommentsIntegration', listCommentsFn),
            authorizer,
        });
    }
}
exports.BulletinStack = BulletinStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVsbGV0aW4tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJidWxsZXRpbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBOzs7Ozs7Ozs7R0FTRztBQUNILDZDQUEwRDtBQUUxRCxtRUFBbUU7QUFFbkUsNkZBQWtGO0FBQ2xGLHFFQUErRDtBQUMvRCx1REFBaUQ7QUFFakQsMkNBQTZCO0FBYTdCLE1BQWEsYUFBYyxTQUFRLG1CQUFLO0lBQ3RDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUNKLEtBQUssRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUM3QixrQkFBa0IsRUFBRSxxQkFBcUIsRUFBRSxrQkFBa0IsRUFDN0QsZUFBZSxFQUFFLG1CQUFtQixHQUNyQyxHQUFHLEtBQUssQ0FBQztRQUVWLE1BQU0sU0FBUyxHQUFHO1lBQ2hCLEtBQUssRUFBRSxLQUFLO1lBQ1osb0JBQW9CLEVBQUUsa0JBQWtCLENBQUMsU0FBUztZQUNsRCx1QkFBdUIsRUFBRSxxQkFBcUIsQ0FBQyxTQUFTO1lBQ3hELG9CQUFvQixFQUFFLGtCQUFrQixDQUFDLFNBQVM7WUFDbEQsZ0JBQWdCLEVBQUUsZUFBZSxDQUFDLFNBQVM7WUFDM0MscUJBQXFCLEVBQUUsbUJBQW1CLENBQUMsU0FBUztTQUNyRCxDQUFDO1FBRUYsTUFBTSxXQUFXLEdBQUc7WUFDbEIsT0FBTyxFQUFFLG9CQUFPLENBQUMsV0FBVztZQUM1QixPQUFPLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzdCLFVBQVUsRUFBRSxHQUFHO1lBQ2YsUUFBUSxFQUFFO2dCQUNSLE1BQU0sRUFBRSxJQUFJO2dCQUNaLFNBQVMsRUFBRSxLQUFLLEtBQUssS0FBSztnQkFDMUIsZUFBZSxFQUFFLENB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QWMsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUN0RCxVQUFVLENBQUMsU0FBUyxDQUFDO1lBQ25CLElBQUksRUFBRSxpREFBaUQ7WUFDdkQsT0FBTyxFQUFFLENBQUMsNkJBQVUsQ0FBQyxJQUFJLENBQUM7WUFDMUIsV0FBVyxFQUFFLElBQUkscURBQXFCLENBQUMsMEJBQTBCLEVBQUUsZUFBZSxDQUFDO1lBQ25GLFVBQVU7U0FDWCxDQUFDLENBQUM7UUFFSCwrQkFBK0I7UUFDL0IsTUFBTSxjQUFjLEdBQUcsSUFBSSxrQ0FBYyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNoRSxHQUFHLFdBQVc7WUFDZCxZQUFZLEVBQUUsUUFBUSxLQUFLLHlCQUF5QjtZQUNwRCxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsd0RBQXdELENBQUM7WUFDckYsT0FBTyxFQUFFLFNBQVM7WUFDbEIsV0FBVyxFQUFFLFNBQVM7U0FDdkIsQ0FBQyxDQUFDO1FBQ0gscUJBQXFCLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3BELFVBQVUsQ0FBQyxTQUFTLENBQUM7WUFDbkIsSUFBSSxFQUFFLGlEQUFpRDtZQUN2RCxPQUFPLEVBQUUsQ0FBQyw2QkFBVSxDQUFDLEdBQUcsQ0FBQztZQUN6QixXQUFXLEVBQUUsSUFBSSxxREFBcUIsQ0FBQyx5QkFBeUIsRUFBRSxjQUFjLENBQUM7WUFDakYsVUFBVTtTQUNYLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQWxIRCxzQ0FrSEMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogQnVsbGV0aW4gU3RhY2tcclxuICpcclxuICog7LGM66aw7KeAIOykgOu5hC/sp4Ttlokg64uo6rOEIOqyjOyLnO2MkCBBUEk6XHJcbiAqICAgUE9TVCAgIC9idWxsZXRpbi97Y2hhbGxlbmdlSWR9L3Bvc3RzICAgICAgICAgICAgICAgICAgICAgICAgLSDquIAg7J6R7ISxXHJcbiAqICAgR0VUICAgIC9idWxsZXRpbi97Y2hhbGxlbmdlSWR9L3Bvc3RzP3BoYXNlPXByZXBhcmluZyAgICAgICAgLSDquIAg66qp66GdXHJcbiAqICAgUE9TVCAgIC9idWxsZXRpbi97Y2hhbGxlbmdlSWR9L3Bvc3RzL3twb3N0SWR9L2xpa2UgICAgICAgICAgLSDsoovslYTsmpQg7Yag6riAXHJcbiAqICAgUE9TVCAgIC9idWxsZXRpbi97Y2hhbGxlbmdlSWR9L3Bvc3RzL3twb3N0SWR9L2NvbW1lbnRzICAgICAgLSDrjJPquIAg7J6R7ISxXHJcbiAqICAgR0VUICAgIC9idWxsZXRpbi97Y2hhbGxlbmdlSWR9L3Bvc3RzL3twb3N0SWR9L2NvbW1lbnRzICAgICAgLSDrjJPquIAg66qp66GdXHJcbiAqL1xyXG5pbXBvcnQgeyBTdGFjaywgU3RhY2tQcm9wcywgRHVyYXRpb24gfSBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5pbXBvcnQgeyBIdHRwQXBpLCBIdHRwTWV0aG9kIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mic7XHJcbmltcG9ydCB7IEh0dHBKd3RBdXRob3JpemVyIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mi1hdXRob3JpemVycyc7XHJcbmltcG9ydCB7IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbiB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5djItaW50ZWdyYXRpb25zJztcclxuaW1wb3J0IHsgTm9kZWpzRnVuY3Rpb24gfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLW5vZGVqcyc7XHJcbmltcG9ydCB7IFJ1bnRpbWUgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcclxuaW1wb3J0IHsgVGFibGUgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5cclxuaW50ZXJmYWNlIEJ1bGxldGluU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xyXG4gIHN0YWdlOiBzdHJpbmc7XHJcbiAgYXBpR2F0ZXdheTogSHR0cEFwaTtcclxuICBhdXRob3JpemVyOiBIdHRwSnd0QXV0aG9yaXplcjtcclxuICBidWxsZXRpblBvc3RzVGFibGU6IFRhYmxlO1xyXG4gIGJ1bGxldGluQ29tbWVudHNUYWJsZTogVGFibGU7XHJcbiAgYnVsbGV0aW5MaWtlc1RhYmxlOiBUYWJsZTtcclxuICBjaGFsbGVuZ2VzVGFibGU6IFRhYmxlO1xyXG4gIHVzZXJDaGFsbGVuZ2VzVGFibGU6IFRhYmxlO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQnVsbGV0aW5TdGFjayBleHRlbmRzIFN0YWNrIHtcclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQnVsbGV0aW5TdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICBjb25zdCB7XHJcbiAgICAgIHN0YWdlLCBhcGlHYXRld2F5LCBhdXRob3JpemVyLFxyXG4gICAgICBidWxsZXRpblBvc3RzVGFibGUsIGJ1bGxldGluQ29tbWVudHNUYWJsZSwgYnVsbGV0aW5MaWtlc1RhYmxlLFxyXG4gICAgICBjaGFsbGVuZ2VzVGFibGUsIHVzZXJDaGFsbGVuZ2VzVGFibGUsXHJcbiAgICB9ID0gcHJvcHM7XHJcblxyXG4gICAgY29uc3QgY29tbW9uRW52ID0ge1xyXG4gICAgICBTVEFHRTogc3RhZ2UsXHJcbiAgICAgIEJVTExFVElOX1BPU1RTX1RBQkxFOiBidWxsZXRpblBvc3RzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBCVUxMRVRJTl9DT01NRU5UU19UQUJMRTogYnVsbGV0aW5Db21tZW50c1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgQlVMTEVUSU5fTElLRVNfVEFCTEU6IGJ1bGxldGluTGlrZXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIENIQUxMRU5HRVNfVEFCTEU6IGNoYWxsZW5nZXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIFVTRVJfQ0hBTExFTkdFU19UQUJMRTogdXNlckNoYWxsZW5nZXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IGNvbW1vblByb3BzID0ge1xyXG4gICAgICBydW50aW1lOiBSdW50aW1lLk5PREVKU18yMF9YLFxyXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxyXG4gICAgICBidW5kbGluZzoge1xyXG4gICAgICAgIG1pbmlmeTogdHJ1ZSxcclxuICAgICAgICBzb3VyY2VNYXA6IHN0YWdlID09PSAnZGV2JyxcclxuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxyXG4gICAgICB9LFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyAxLiBDcmVhdGUgUG9zdFxyXG4gICAgY29uc3QgY3JlYXRlUG9zdEZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdDcmVhdGVQb3N0Rm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6IGBjaG1lLSR7c3RhZ2V9LWJ1bGxldGluLWNyZWF0ZS1wb3N0YCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL2J1bGxldGluL2NyZWF0ZS1wb3N0L2luZGV4LnRzJyksXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgIH0pO1xyXG4gICAgYnVsbGV0aW5Qb3N0c1RhYmxlLmdyYW50V3JpdGVEYXRhKGNyZWF0ZVBvc3RGbik7XHJcbiAgICBjaGFsbGVuZ2VzVGFibGUuZ3JhbnRSZWFkRGF0YShjcmVhdGVQb3N0Rm4pO1xyXG4gICAgdXNlckNoYWxsZW5nZXNUYWJsZS5ncmFudFJlYWREYXRhKGNyZWF0ZVBvc3RGbik7XHJcbiAgICBhcGlHYXRld2F5LmFkZFJvdXRlcyh7XHJcbiAgICAgIHBhdGg6ICcvYnVsbGV0aW4ve2NoYWxsZW5nZUlkfS9wb3N0cycsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLlBPU1RdLFxyXG4gICAgICBpbnRlZ3JhdGlvbjogbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignQ3JlYXRlUG9zdEludGVncmF0aW9uJywgY3JlYXRlUG9zdEZuKSxcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDIuIExpc3QgUG9zdHMgKHByb3RlY3RlZClcclxuICAgIGNvbnN0IGxpc3RQb3N0c0ZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdMaXN0UG9zdHNGbicsIHtcclxuICAgICAgLi4uY29tbW9uUHJvcHMsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGNobWUtJHtzdGFnZX0tYnVsbGV0aW4tbGlzdC1wb3N0c2AsXHJcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9zZXJ2aWNlcy9idWxsZXRpbi9saXN0LXBvc3RzL2luZGV4LnRzJyksXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgIH0pO1xyXG4gICAgYnVsbGV0aW5Qb3N0c1RhYmxlLmdyYW50UmVhZERhdGEobGlzdFBvc3RzRm4pO1xyXG4gICAgYXBpR2F0ZXdheS5hZGRSb3V0ZXMoe1xyXG4gICAgICBwYXRoOiAnL2J1bGxldGluL3tjaGFsbGVuZ2VJZH0vcG9zdHMnLFxyXG4gICAgICBtZXRob2RzOiBbSHR0cE1ldGhvZC5HRVRdLFxyXG4gICAgICBpbnRlZ3JhdGlvbjogbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignTGlzdFBvc3RzSW50ZWdyYXRpb24nLCBsaXN0UG9zdHNGbiksXHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyAzLiBMaWtlIFBvc3QgKHRvZ2dsZSkgKHByb3RlY3RlZClcclxuICAgIGNvbnN0IGxpa2VQb3N0Rm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ0xpa2VQb3N0Rm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6IGBjaG1lLSR7c3RhZ2V9LWJ1bGxldGluLWxpa2UtcG9zdGAsXHJcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9zZXJ2aWNlcy9idWxsZXRpbi9saWtlLXBvc3QvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICBidWxsZXRpblBvc3RzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGxpa2VQb3N0Rm4pO1xyXG4gICAgYnVsbGV0aW5MaWtlc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShsaWtlUG9zdEZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9idWxsZXRpbi97Y2hhbGxlbmdlSWR9L3Bvc3RzL3twb3N0SWR9L2xpa2UnLFxyXG4gICAgICBtZXRob2RzOiBbSHR0cE1ldGhvZC5QT1NUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ0xpa2VQb3N0SW50ZWdyYXRpb24nLCBsaWtlUG9zdEZuKSxcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDQuIENyZWF0ZSBDb21tZW50IChwcm90ZWN0ZWQpXHJcbiAgICBjb25zdCBjcmVhdGVDb21tZW50Rm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ0NyZWF0ZUNvbW1lbnRGbicsIHtcclxuICAgICAgLi4uY29tbW9uUHJvcHMsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGNobWUtJHtzdGFnZX0tYnVsbGV0aW4tY3JlYXRlLWNvbW1lbnRgLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvc2VydmljZXMvYnVsbGV0aW4vY3JlYXRlLWNvbW1lbnQvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICBidWxsZXRpblBvc3RzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGNyZWF0ZUNvbW1lbnRGbik7XHJcbiAgICBidWxsZXRpbkNvbW1lbnRzVGFibGUuZ3JhbnRXcml0ZURhdGEoY3JlYXRlQ29tbWVudEZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9idWxsZXRpbi97Y2hhbGxlbmdlSWR9L3Bvc3RzL3twb3N0SWR9L2NvbW1lbnRzJyxcclxuICAgICAgbWV0aG9kczogW0h0dHBNZXRob2QuUE9TVF0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdDcmVhdGVDb21tZW50SW50ZWdyYXRpb24nLCBjcmVhdGVDb21tZW50Rm4pLFxyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gNS4gTGlzdCBDb21tZW50cyAocHJvdGVjdGVkKVxyXG4gICAgY29uc3QgbGlzdENvbW1lbnRzRm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ0xpc3RDb21tZW50c0ZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1idWxsZXRpbi1saXN0LWNvbW1lbnRzYCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL2J1bGxldGluL2xpc3QtY29tbWVudHMvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICBidWxsZXRpbkNvbW1lbnRzVGFibGUuZ3JhbnRSZWFkRGF0YShsaXN0Q29tbWVudHNGbik7XHJcbiAgICBhcGlHYXRld2F5LmFkZFJvdXRlcyh7XHJcbiAgICAgIHBhdGg6ICcvYnVsbGV0aW4ve2NoYWxsZW5nZUlkfS9wb3N0cy97cG9zdElkfS9jb21tZW50cycsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLkdFVF0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdMaXN0Q29tbWVudHNJbnRlZ3JhdGlvbicsIGxpc3RDb21tZW50c0ZuKSxcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=