import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

interface HashtagStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  hashtagsTable: Table;
  hashtagFollowsTable: Table;
  plazaPostsTable: Table;
}

export class HashtagStack extends Stack {
  constructor(scope: Construct, id: string, props: HashtagStackProps) {
    super(scope, id, props);

    const {
      stage,
      apiGateway,
      authorizer,
      hashtagsTable,
      hashtagFollowsTable,
      plazaPostsTable,
    } = props;

    const commonProps = {
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(15),
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: stage === 'dev',
        externalModules: ['@aws-sdk/*'],
      },
    };

    const hashtagFn = new NodejsFunction(this, 'HashtagFn', {
      ...commonProps,
      functionName: `chme-${stage}-hashtag`,
      entry: path.join(__dirname, '../../backend/services/plaza/hashtag/index.ts'),
      handler: 'handler',
      environment: {
        STAGE: stage,
        HASHTAGS_TABLE: hashtagsTable.tableName,
        HASHTAG_FOLLOWS_TABLE: hashtagFollowsTable.tableName,
        PLAZA_POSTS_TABLE: plazaPostsTable.tableName,
      },
    });

    hashtagsTable.grantReadWriteData(hashtagFn);
    hashtagFollowsTable.grantReadWriteData(hashtagFn);
    plazaPostsTable.grantReadData(hashtagFn);

    // GET /hashtags — 최신 태그 목록
    apiGateway.addRoutes({
      path: '/hashtags',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('HashtagListIntegration', hashtagFn),
      authorizer,
    });

    // GET /hashtags/{tag} — 태그 메타
    apiGateway.addRoutes({
      path: '/hashtags/{tag}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('HashtagGetIntegration', hashtagFn),
      authorizer,
    });

    // GET /hashtags/{tag}/posts — 태그 게시물 목록
    apiGateway.addRoutes({
      path: '/hashtags/{tag}/posts',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('HashtagPostsIntegration', hashtagFn),
      authorizer,
    });

    // GET /hashtags/{tag}/follow/status — 팔로우 여부
    apiGateway.addRoutes({
      path: '/hashtags/{tag}/follow/status',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('HashtagFollowStatusIntegration', hashtagFn),
      authorizer,
    });

    // POST /hashtags/{tag}/follow — 팔로우
    apiGateway.addRoutes({
      path: '/hashtags/{tag}/follow',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('HashtagFollowIntegration', hashtagFn),
      authorizer,
    });

    // DELETE /hashtags/{tag}/follow — 팔로우 취소
    apiGateway.addRoutes({
      path: '/hashtags/{tag}/follow',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('HashtagUnfollowIntegration', hashtagFn),
      authorizer,
    });
  }
}
