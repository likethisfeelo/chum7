# CheerStats Materializer 운영 런북

## 목적
`chme-{stage}-cheer-stats-materializer` Lambda를 이용해 `CHEERS_TABLE` 데이터를 `CHEER_STATS_TABLE` 버킷 통계로 적재/백필한다.

## 이벤트 파라미터 표준

```json
{
  "fromIso": "2026-03-01T00:00:00.000Z",
  "toIso": "2026-03-31T23:59:59.999Z",
  "dryRun": true,
  "maxRetries": 7
}
```

- `fromIso` / `toIso` (옵션): 해당 기간 데이터만 집계
- `dryRun` (옵션): `true`면 write 없이 집계 건수만 계산
- `maxRetries` (옵션): BatchWrite `UnprocessedItems` 재시도 횟수 오버라이드

## 실행 스크립트

### Linux/macOS
```bash
./scripts/cheer-stats-backfill.sh --stage dev --dry-run
./scripts/cheer-stats-backfill.sh --stage prod --from 2026-03-01T00:00:00.000Z --to 2026-03-31T23:59:59.999Z --max-retries 7
```

### Windows PowerShell
```powershell
./scripts/cheer-stats-backfill.ps1 -Stage dev -DryRun
./scripts/cheer-stats-backfill.ps1 -Stage prod -FromIso 2026-03-01T00:00:00.000Z -ToIso 2026-03-31T23:59:59.999Z -MaxRetries 7
```

## 운영 체크리스트
1. **Dry-run 선행**: 같은 파라미터로 dry-run 결과(`scanned`, `filtered`, `written`) 확인
2. **실적재 실행**: dry-run과 동일 파라미터로 `dryRun=false` 실행
3. **실패 건수 확인**: 결과의 `failed`가 0인지 확인 (0이 아니면 재실행)
4. **API 샘플 검증**: `GET /cheers/stats`에서 `source=bucketed` 비율 증가 확인
5. **로그 확인**: `Cheer stats materializer retrying unprocessed items` 경고가 과도한지 점검

## 장애 대응
- `CHEER_STATS_TABLE is required`: 환경변수 누락 확인
- `failed > 0`: `maxRetries` 상향 + 범위 분할(`fromIso/toIso`) 재실행
- Lambda timeout: 기간 범위를 더 잘게 나누어 여러 번 수행

## 롤백
- materializer 실행 중단(스케줄 비활성화)
- stats API는 realtime fallback이 있으므로 서비스 조회 자체는 유지됨
