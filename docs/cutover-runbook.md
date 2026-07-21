# Phase 5 전환 런북 — chme(구) → chme2(신) 컷오버·철거

전환은 **AWS 자격증명이 있는 환경에서 사람이 실행**한다. 각 단계는 되돌릴 수 있는 지점(롤백)을
명시한다. 신·구 시스템은 스택 프리픽스(`chme-*` vs `chme2-*`)로 완전 분리돼 있어
컷오버 전까지 서로 영향이 없다.

## 전제 조건 (완료 확인)

- [ ] dev 실배포 검증 완료: `/health`, 회원가입/로그인, 챌린지 생성→참여→인증,
      쿠폰→유료 참여, 어드민 콘솔 접속
- [ ] VAPID 키 주입 (`chme2-<stage>/vapid`) — 푸시 확인
- [ ] 어드민 계정 `admins` 그룹 배정
- [ ] prod로 옮길 운영 데이터 없음 재확인 (데이터 새 출발 결정 — REDESIGN_PLAN)

## 1단계 — prod 병행 배포 (무도메인, 무중단·무영향)

```powershell
npm run deploy -- --stage prod --diff   # 검토
npm run deploy -- --stage prod          # 'DEPLOY' 입력
```
- 결과: `chme2-prod-*` 스택이 CloudFront/API Gateway **기본 URL**로 생성됨.
  기존 www/api.chum7.com은 여전히 구 시스템 → 사용자 영향 0.
- 스모크: Outputs의 `ApiUrl`/`AppUrl`/`AdminUrl`로 dev와 동일한 검증 반복.
- 1회성: prod VAPID 주입, prod 어드민 그룹 배정, (유료 운영 시) prod 쿠폰 발급 테스트.
- 롤백: `cdk destroy` 가능 (아무 것도 연결 안 됨).

## 2단계 — DNS 전환 (이 배포가 곧 컷오버)

`infra2/config/stages.ts`의 prod `domain` 주석 해제:
```ts
domain: { zoneName: 'chum7.com', app: 'www.chum7.com', api: 'api.chum7.com', admin: 'admin.chum7.com' },
```
```powershell
npm run deploy -- --stage prod --diff   # Route53 레코드 변경 확인 (필수!)
npm run deploy -- --stage prod
```
- CDK가 수행: CloudFront 인증서(us-east-1)·API 리전 인증서 발급(DNS 검증 자동),
  www/admin → 신규 CloudFront, api → 신규 API Gateway로 **Route53 레코드 교체**
  (`deleteExisting: true` — 구 시스템의 수동 레코드를 대체).
- DNS TTL 동안 신·구 혼재 트래픽 발생 가능 → 컷오버는 **저트래픽 시간대** 권장.
- 검증: `nslookup www.chum7.com`, 실사용 플로우 왕복, CloudWatch `chme2-prod-ops` 대시보드.
- **롤백**: `domain`을 다시 undefined로 되돌려 배포하면 레코드가 제거되므로,
  롤백 시에는 Route53 콘솔에서 구 CloudFront/API로 레코드를 수동 복원하는 편이 빠르다
  (구 배포 ID는 AWS 콘솔에서 확인 — 리포에 기재 금지 원칙).
- dev도 동일 절차로 test.chum7.com 등 전환 (선택).

## 3단계 — 안정화 관찰 (권장 3~7일)

- [ ] 알람 0건 유지, 에러 로그 리뷰 (Logs Insights)
- [ ] 워커 동작 확인: 라이프사이클(10분), 응원 발송(5분), 마당 변환(1시간), 정산(이벤트)
- [ ] 이 기간 동안 구 스택은 **건드리지 않는다** (비상 롤백 대상)

## 4단계 — 구 AWS 환경 철거

```powershell
cd infra   # 구 CDK 앱
npx cdk destroy --all --context stage=prod
npx cdk destroy --all --context stage=dev
```
- 콘솔 수작업 리소스(CDK 밖에서 만든 것)는 수동 삭제: 구 S3 버킷(chme-dev,
  chum7-*-uploads·static — **필요한 업로드 파일이 있으면 먼저 신규 버킷으로 sync**),
  구 CloudFront 배포, 구 Cognito 풀, 구 DynamoDB 테이블(RETAIN분).
- ⚠️ 구 prod 테이블은 삭제 전 최종 백업(Export to S3) 1회 권장 (만일의 참조용).

## 5단계 — 리포 철거 (구 코드 삭제)

- [ ] `backend/` 전체 (레거시 Lambda 소스 — PORTING.md들이 매핑 기록을 보존)
- [ ] `infra/` 전체 (구 CDK 앱)
- [ ] `scripts/deploy-dev.ps1`, `deploy-prod.ps1`, `cdk-lambda-diagnose.{sh,ps1}`,
      `cheer-stats-backfill.{sh,ps1}`, `cheer-materializer-rerun-failed.sh` (materializer 퇴역),
      `backfill-challenge-layer-policy.mjs` (구 테이블 대상)
- [ ] `test/` 루트의 레거시 테스트 (backend/ 참조분 — 사전에 실패 28건 포함 스위트 정리)
- [ ] `shared/join-requirements.ts` (challenge-api로 이식 완료)
- [ ] README 재작성: 신규 체계 단일 기준, `infra2`→`infra`로 디렉터리 개명 검토
- [ ] REDESIGN_PLAN에 전환 완료 기록, PR 정리

## 참고 — 전환 후 남는 선택 과제

- PG 계약 체결 → `/hooks/pg` 웹훅 연결 (COMMERCE_V0.md의 confirm 대체)
- 커스텀 도메인 dev 스테이지 적용, admin.chum7.com 안내
- OpenSearch 탐색 고도화, 기간별 응원 통계 버킷 (백로그)
