# CheerStats Materializer 운영 런북

## 목적
`chme-{stage}-cheer-stats-materializer` Lambda를 이용해 `CHEERS_TABLE` 데이터를 `CHEER_STATS_TABLE` 버킷 통계로 적재/백필한다.

## 이벤트 파라미터 표준

```json
{
  "fromIso": "2026-03-01T00:00:00.000Z",
  "toIso": "2026-03-31T23:59:59.999Z",
  "dryRun": true,
  "maxRetries": 7,
  "totalSegments": 4,
  "segmentIndex": 0,
  "maxScanPages": 20,
  "scanPageSize": 500
}
```

- `fromIso` / `toIso` (옵션): 해당 기간 데이터만 집계 (ISO-8601), 둘 다 지정 시 `fromIso <= toIso`
- `dryRun` (옵션): `true`면 write 없이 집계 건수만 계산
- `maxRetries` (옵션): BatchWrite `UnprocessedItems` 재시도 횟수 오버라이드 (0 이상)
- `totalSegments` / `segmentIndex` (옵션): Scan 분할 실행(병렬 백필/부분 재실행)
- `failedSegments` (스크립트 옵션): 실패 세그먼트만 순차 재실행 (중복 입력은 자동 제거, 오름차순 정규화)
- `orchestratorArn` (스크립트 옵션): Step Functions 오케스트레이터 직접 실행
- `executionName` (스크립트 옵션): 오케스트레이터 실행 이름 지정(재시도 추적 용도, orchestratorArn과 함께 사용)
- `maxScanPages` (옵션): 한 번 실행에서 최대 Scan 페이지 수 제한 (1 이상)
- `scanPageSize` (옵션): Scan `Limit` (1~1000, 기본 500 권장)
- `segmentIndex`와 `failedSegments`는 동시에 지정할 수 없음
- `segmentIndex`/`failedSegments` 사용 시 `totalSegments`를 함께 지정해야 함
- `segmentIndex`는 0 이상이어야 하며 `totalSegments`를 지정한 경우 `segmentIndex < totalSegments`여야 함
- `orchestratorArn` 사용 시 `segmentIndex` 단일 지정 대신 `failedSegments` 또는 `totalSegments` 사용

## 실행 스크립트

### Linux/macOS
```bash
./scripts/cheer-stats-backfill.sh --stage dev --dry-run
./scripts/cheer-stats-backfill.sh --stage prod --from 2026-03-01T00:00:00.000Z --to 2026-03-31T23:59:59.999Z --max-retries 7
./scripts/cheer-stats-backfill.sh --stage prod --total-segments 4 --segment-index 0 --max-scan-pages 20 --scan-page-size 500
./scripts/cheer-stats-backfill.sh --stage prod --total-segments 4 --failed-segments 1,3
./scripts/cheer-stats-backfill.sh --stage prod --orchestrator-arn arn:aws:states:ap-northeast-2:123456789012:stateMachine:chme-prod-cheer-stats-materializer-orchestrator --total-segments 4
./scripts/cheer-stats-backfill.sh --stage prod --orchestrator-arn arn:aws:states:ap-northeast-2:123456789012:stateMachine:chme-prod-cheer-stats-materializer-orchestrator --failed-segments 1,3
./scripts/cheer-stats-backfill.sh --stage prod --orchestrator-arn arn:aws:states:ap-northeast-2:123456789012:stateMachine:chme-prod-cheer-stats-materializer-orchestrator --execution-name cheer-stats-backfill-20260331
```

### Windows PowerShell
```powershell
./scripts/cheer-stats-backfill.ps1 -Stage dev -DryRun
./scripts/cheer-stats-backfill.ps1 -Stage prod -FromIso 2026-03-01T00:00:00.000Z -ToIso 2026-03-31T23:59:59.999Z -MaxRetries 7
./scripts/cheer-stats-backfill.ps1 -Stage prod -TotalSegments 4 -SegmentIndex 0 -MaxScanPages 20 -ScanPageSize 500
./scripts/cheer-stats-backfill.ps1 -Stage prod -TotalSegments 4 -FailedSegments 1,3
./scripts/cheer-stats-backfill.ps1 -Stage prod -OrchestratorArn arn:aws:states:ap-northeast-2:123456789012:stateMachine:chme-prod-cheer-stats-materializer-orchestrator -TotalSegments 4
./scripts/cheer-stats-backfill.ps1 -Stage prod -OrchestratorArn arn:aws:states:ap-northeast-2:123456789012:stateMachine:chme-prod-cheer-stats-materializer-orchestrator -FailedSegments 1,3
./scripts/cheer-stats-backfill.ps1 -Stage prod -OrchestratorArn arn:aws:states:ap-northeast-2:123456789012:stateMachine:chme-prod-cheer-stats-materializer-orchestrator -ExecutionName cheer-stats-backfill-20260331
```

## 스케줄 오케스트레이션 환경변수 (CDK 배포 시)
- 스케줄 트리거는 EventBridge → Step Functions(`CheerStatsMaterializerOrchestrator`) → segment map 병렬 invoke 흐름으로 동작
- `CHEER_STATS_MATERIALIZER_SCHEDULE_MINUTES`: 실행 주기(분)
- `CHEER_STATS_MATERIALIZER_TOTAL_SEGMENTS`: 세그먼트 개수(병렬 fan-out)
- `CHEER_STATS_MATERIALIZER_MAX_SCAN_PAGES`: invocation당 최대 scan 페이지
- `CHEER_STATS_MATERIALIZER_SCAN_PAGE_SIZE`: scan limit (권장 500)
- 오케스트레이터 map 병렬도는 `min(totalSegments, 5)`로 제한

## 운영 체크리스트
1. **Dry-run 선행**: 같은 파라미터로 dry-run 결과(`scanned`, `filtered`, `written`) 확인
2. **실적재 실행**: dry-run과 동일 파라미터로 `dryRun=false` 실행
3. **실패 건수 확인**: 결과의 `failed`가 0인지 확인 (0이 아니면 재실행)
4. **실패 세그먼트 재실행**: `--failed-segments`/`-FailedSegments`로 실패 segment만 재시도
5. **오케스트레이터 재실행(권장)**: `--orchestrator-arn`/`-OrchestratorArn`으로 병렬 세그먼트 실행
6. **세그먼트/페이지 점검**: `scannedPages`, `truncated`, `segment/totalSegments` 로그로 실행 범위 확인
7. **API 샘플 검증**: `GET /cheers/stats`에서 `source=bucketed` 비율 증가 확인
8. **로그 확인**: `Cheer stats materializer retrying unprocessed items` 경고가 과도한지 점검

## 장애 대응
- `CHEER_STATS_TABLE is required`: 환경변수 누락 확인
- `failed > 0`: `maxRetries` 상향 + 범위 분할(`fromIso/toIso`) 재실행
- Lambda timeout: `maxScanPages`를 낮추고 `segment/totalSegments` 분할 실행으로 나눠서 수행

## 참고 문서
- `docs/cheer-observability-widget-catalog.md` (대시보드 위젯 운영 표준)

## 롤백
- materializer 실행 중단(스케줄 비활성화)
- stats API는 realtime fallback이 있으므로 서비스 조회 자체는 유지됨


## 실패 세그먼트 재실행 + 알림 자동화(신규)

운영자가 실패 세그먼트 재실행 후 알림을 자동 전송하려면 아래 wrapper 스크립트를 사용한다.

```bash
./scripts/cheer-materializer-rerun-failed.sh --stage prod --total-segments 4 --failed-segments 1,3
./scripts/cheer-materializer-rerun-failed.sh --stage prod --orchestrator-arn arn:aws:states:ap-northeast-2:123456789012:stateMachine:chme-prod-cheer-stats-materializer-orchestrator --total-segments 4 --failed-segments 1,3 --notify-topic-arn arn:aws:sns:ap-northeast-2:123456789012:ops-alerts
```

- 내부적으로 `scripts/cheer-stats-backfill.sh`를 호출한다.
- `--notify-topic-arn`이 지정되면 실행 직후 SNS 알림을 발송한다.
- 배포 파이프라인/수동 재실행 공통 진입점으로 사용한다.
