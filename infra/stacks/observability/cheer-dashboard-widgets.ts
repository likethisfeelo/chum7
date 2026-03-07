import { Duration } from 'aws-cdk-lib';
import { GraphWidget, Metric, SingleValueWidget } from 'aws-cdk-lib/aws-cloudwatch';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export type CheerDashboardWidgetInput = {
  replyErrorMetric: Metric;
  reactErrorMetric: Metric;
  statsErrorMetric: Metric;
  statsBucketedMetric: Metric;
  statsRealtimeFallbackMetric: Metric;
  replyRequestMetric: Metric;
  replySuccessMetric: Metric;
  replyClientErrorMetric: Metric;
  reactRequestMetric: Metric;
  reactSuccessMetric: Metric;
  reactClientErrorMetric: Metric;
  statsRequestMetric: Metric;
  statsSuccessMetric: Metric;
  cheerReplyFnRef: NodejsFunction;
  cheerReactFnRef: NodejsFunction;
  cheerStatsFnRef: NodejsFunction;
  statsMaterializerFnRef: NodejsFunction;
  materializerStateMachineStartedMetric: Metric;
  materializerStateMachineSucceededMetric: Metric;
  materializerStateMachineFailedMetric: Metric;
};

export function buildCheerOpsWidgetRows(input: CheerDashboardWidgetInput): Array<Array<GraphWidget | SingleValueWidget>> {
  return [
    [
      new SingleValueWidget({
        title: 'Cheer Error Count (5m)',
        metrics: [input.replyErrorMetric, input.reactErrorMetric, input.statsErrorMetric],
        width: 8
      }),
      new GraphWidget({
        title: 'Cheer Handler Latency p95',
        left: [
          input.cheerReplyFnRef.metricDuration({ statistic: 'p95', period: Duration.minutes(5) }),
          input.cheerReactFnRef.metricDuration({ statistic: 'p95', period: Duration.minutes(5) }),
          input.cheerStatsFnRef.metricDuration({ statistic: 'p95', period: Duration.minutes(5) })
        ],
        width: 16
      })
    ],
    [
      new GraphWidget({
        title: 'Cheer Stats Source Mix (5m)',
        left: [input.statsBucketedMetric, input.statsRealtimeFallbackMetric],
        width: 12
      }),
      new GraphWidget({
        title: 'Materializer Invocations/Errors',
        left: [
          input.statsMaterializerFnRef.metricInvocations({ period: Duration.minutes(5) }),
          input.statsMaterializerFnRef.metricErrors({ period: Duration.minutes(5) }),
          input.materializerStateMachineFailedMetric
        ],
        width: 8
      }),
      new GraphWidget({
        title: 'Materializer Orchestrator (started/succeeded/failed)',
        left: [
          input.materializerStateMachineStartedMetric,
          input.materializerStateMachineSucceededMetric,
          input.materializerStateMachineFailedMetric
        ],
        width: 4
      })
    ],
    [
      new GraphWidget({
        title: 'Reply Traffic Split (req/success/429)',
        left: [input.replyRequestMetric, input.replySuccessMetric, input.replyClientErrorMetric],
        width: 8
      }),
      new GraphWidget({
        title: 'React Traffic Split (req/success/429)',
        left: [input.reactRequestMetric, input.reactSuccessMetric, input.reactClientErrorMetric],
        width: 8
      }),
      new GraphWidget({
        title: 'Stats Traffic Split (req/success/5xx)',
        left: [input.statsRequestMetric, input.statsSuccessMetric, input.statsErrorMetric],
        width: 8
      })
    ]
  ];
}
