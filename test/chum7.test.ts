import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Chum7Stack } from '../lib/chum7-stack';

describe('Chum7Stack', () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const stack = new Chum7Stack(app, 'TestStack');
    template = Template.fromStack(stack);
  });

  test('Lambda 함수가 생성된다', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'chum7-hello',
      Runtime: 'nodejs20.x',
      Timeout: 30,
      MemorySize: 256,
    });
  });

  test('Lambda에 환경변수가 설정된다', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          NODE_ENV: 'production',
        },
      },
    });
  });

  test('CloudFormation 출력값이 정의된다', () => {
    template.hasOutput('HelloFunctionArn', {});
    template.hasOutput('HelloFunctionName', {});
  });
});
