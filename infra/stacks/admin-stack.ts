// infra/stacks/admin-stack.ts

import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

interface AdminStackProps extends StackProps {
  stage: string;
  usersTable: Table;
}

export class AdminStack extends Stack {

  // ⭐ CoreStack에서 참조할 Lambda export
  public readonly listUsersFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: AdminStackProps) {
    super(scope, id, props);

    const { stage, usersTable } = props;

    this.listUsersFunction = new NodejsFunction(this, 'ListUsers', {
      functionName: `chme-${stage}-admin-list-users`,
      entry: path.join(__dirname, '../../backend/services/admin/user/list/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
    });

    usersTable.grantReadData(this.listUsersFunction);
  }
}