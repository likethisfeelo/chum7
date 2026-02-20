import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

export class Chum7Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -------------------------------------------------------
    // Hello Lambda (TypeScript, esbuild 번들링)
    // -------------------------------------------------------
    const helloFunction = new lambdaNodejs.NodejsFunction(this, 'HelloFunction', {
      functionName: 'chum7-hello',
      entry: path.join(__dirname, '../lambda/hello/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'es2020',
        // aws-sdk는 Lambda 런타임에 포함되므로 번들에서 제외
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV ?? 'production',
      },
    });

    // -------------------------------------------------------
    // Outputs
    // -------------------------------------------------------
    new cdk.CfnOutput(this, 'HelloFunctionArn', {
      exportName: 'Chum7HelloFunctionArn',
      value: helloFunction.functionArn,
      description: 'Hello Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'HelloFunctionName', {
      exportName: 'Chum7HelloFunctionName',
      value: helloFunction.functionName,
      description: 'Hello Lambda Function Name',
    });
  }
}
