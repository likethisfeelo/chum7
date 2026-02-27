import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  HttpApi,
  CorsHttpMethod,
  CorsPreflightOptions,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';

export interface ApiStackProps extends StackProps {
  stage: string;
  userPoolId: string;
  userPoolClientId: string;
}

export class ApiStack extends Stack {
  public readonly apiGateway: HttpApi;
  public readonly cognitoAuthorizer: HttpJwtAuthorizer;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { stage, userPoolId, userPoolClientId } = props;

    const corsConfig: CorsPreflightOptions = {
      allowOrigins:
        stage === 'prod'
          ? ['https://www.chum7.com']
          : ['*'],
      allowMethods: [
        CorsHttpMethod.GET,
        CorsHttpMethod.POST,
        CorsHttpMethod.PUT,
        CorsHttpMethod.DELETE,
        CorsHttpMethod.OPTIONS,
      ],
      allowHeaders: ['Content-Type', 'Authorization', 'x-user-timezone'],
      maxAge: Duration.days(1),
    };

    this.apiGateway = new HttpApi(this, 'ApiGateway', {
      apiName: `chme-${stage}-api`,
      corsPreflight: corsConfig,
    });

    this.cognitoAuthorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPoolId}`,
      { jwtAudience: [userPoolClientId] },
    );

    new CfnOutput(this, 'ApiUrl', { value: this.apiGateway.apiEndpoint });
  }
}
