#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { resolveStageConfig } from '../config/stages';
import { StatefulStack } from '../stacks/stateful-stack';
import { CertStack } from '../stacks/cert-stack';
import { EdgeStack } from '../stacks/edge-stack';
import { ApiStack } from '../stacks/api-stack';
import { WorkersStack } from '../stacks/workers-stack';
import { ObservabilityStack } from '../stacks/observability-stack';

const app = new cdk.App();
const stage = app.node.tryGetContext('stage') ?? 'dev';
const config = resolveStageConfig(stage);

// 계정/리전은 CLI 프로파일에서 — 리터럴 하드코딩 금지 (REDESIGN_PLAN §3.4)
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2',
};

const stateful = new StatefulStack(app, `${config.prefix}-stateful`, { env, config });

let certificate;
if (config.domain) {
  const cert = new CertStack(app, `${config.prefix}-cert`, {
    env: { account: env.account, region: 'us-east-1' },
    crossRegionReferences: true,
    config,
  });
  certificate = cert.certificate;
}

new EdgeStack(app, `${config.prefix}-edge`, {
  env,
  crossRegionReferences: Boolean(config.domain),
  config,
  stateful,
  certificate,
});

const workers = new WorkersStack(app, `${config.prefix}-workers`, { env, config, stateful });

const api = new ApiStack(app, `${config.prefix}-api`, {
  env,
  config,
  stateful,
  eventBus: workers.eventBus,
});

new ObservabilityStack(app, `${config.prefix}-observability`, {
  env,
  config,
  monitoredFunctions: [...api.functions, ...workers.workerFunctions],
});
