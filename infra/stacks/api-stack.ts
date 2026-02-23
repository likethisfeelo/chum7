import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  HttpApi,
  CorsHttpMethod,
  CorsPreflightOptions,
} from 'aws-cdk-lib/aws-apigatewayv2';

export interface ApiStackProps extends StackProps {
  stage: string;
}

export class ApiStack extends Stack {
  public readonly apiGateway: HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { stage } = props;

    const corsConfig: CorsPreflightOptions = {
      allowOrigins:
        stage === 'prod'
          ? ['https://www.chum7.com']
          : ['http://localhost:5173', 'http://localhost:5174'],
      allowMethods: [
        CorsHttpMethod.GET,
        CorsHttpMethod.POST,
        CorsHttpMethod.PUT,
        CorsHttpMethod.DELETE,
        CorsHttpMethod.OPTIONS,
      ],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: Duration.days(1),
    };

    this.apiGateway = new HttpApi(this, 'ApiGateway', {
      apiName: `chme-${stage}-api`,
      corsPreflight: corsConfig,
    });

    new CfnOutput(this, 'ApiUrl', { value: this.apiGateway.apiEndpoint });
  }
}
