/**
 * Quest Stack
 *
 * 퀘스트 보드 API:
 *   Admin:
 *     POST /admin/quests                                  - 퀘스트 생성
 *     PUT  /admin/quests/submissions/{submissionId}/review - 제출물 승인/거절
 *
 *   User:
 *     GET  /quests                         - 퀘스트 목록 (?challengeId=&status=)
 *     POST /quests/{questId}/submit        - 퀘스트 제출
 *     GET  /quests/my-submissions          - 내 제출 내역 (?includeHistory=true)
 *
 * 2-테이블 패턴:
 *   questSubmissionsTable       → 전체 이력 (append-only)
 *   activeQuestSubmissionsTable → 현재 상태 + 유니크 보장
 */
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
interface QuestStackProps extends StackProps {
    stage: string;
    apiGateway: HttpApi;
    authorizer: HttpJwtAuthorizer;
    questsTable: Table;
    questSubmissionsTable: Table;
    activeQuestSubmissionsTable: Table;
    challengesTable: Table;
}
export declare class QuestStack extends Stack {
    constructor(scope: Construct, id: string, props: QuestStackProps);
}
export {};
