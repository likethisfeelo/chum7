#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Chum7Stack } from '../lib/chum7-stack';

const app = new cdk.App();

new Chum7Stack(app, 'Chum7Stack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  stackName: 'chum7',
  description: 'Chum7 AWS Lambda Stack',
});
