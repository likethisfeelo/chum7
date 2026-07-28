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
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
interface BulletinStackProps extends StackProps {
    stage: string;
    apiGateway: HttpApi;
    authorizer: HttpJwtAuthorizer;
    bulletinPostsTable: Table;
    bulletinCommentsTable: Table;
    bulletinLikesTable: Table;
    challengesTable: Table;
    userChallengesTable: Table;
}
export declare class BulletinStack extends Stack {
    constructor(scope: Construct, id: string, props: BulletinStackProps);
}
export {};
