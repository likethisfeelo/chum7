import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { StageConfig } from '../config/stages';

export interface ObservabilityStackProps extends cdk.StackProps {
  config: StageConfig;
  /** 알람 대상 Lambda — 도메인이 추가될 때마다 여기 배열에 넣는다 */
  monitoredFunctions: lambda.IFunction[];
}

export class ObservabilityStack extends cdk.Stack {
  readonly opsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    const { config, monitoredFunctions } = props;

    this.opsTopic = new sns.Topic(this, 'OpsAlerts', {
      topicName: `${config.prefix}-ops-alerts`,
    });
    if (config.opsAlertEmail) {
      this.opsTopic.addSubscription(new subscriptions.EmailSubscription(config.opsAlertEmail));
    }

    const dashboard = new cloudwatch.Dashboard(this, 'OpsDashboard', {
      dashboardName: `${config.prefix}-ops`,
    });

    for (const fn of monitoredFunctions) {
      const errors = fn.metricErrors({ period: cdk.Duration.minutes(5) });
      const alarm = new cloudwatch.Alarm(this, `${fn.node.id}Errors`, {
        alarmName: `${config.prefix}-${fn.node.id}-errors`,
        metric: errors,
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(new cwActions.SnsAction(this.opsTopic));

      dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: fn.node.id,
          left: [fn.metricInvocations({ period: cdk.Duration.minutes(5) }), errors],
          right: [fn.metricDuration({ period: cdk.Duration.minutes(5) })],
          width: 12,
        }),
      );
    }
  }
}
