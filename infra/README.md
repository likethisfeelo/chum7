# infra — 현행(chme-*) CDK 앱

> ⚠️ 이 디렉터리는 **재구축 전의 현행 인프라**입니다. 신규 인프라는 `REDESIGN_PLAN.md`에 따라
> `infra2/`(스택 프리픽스 `chme2-*`)에 구축되며, 전환(Phase 5) 완료 후 이 디렉터리는 삭제됩니다.

- 엔트리: `bin/chme.ts` (`cdk.json` 참조), 스테이지: `--context stage=dev|prod`
- 스테이지 설정: `config/dev.ts`, `config/prod.ts` — CloudFront/버킷 ID 등의 **단일 진실 원천**
  (스크립트·README에 ID를 복사하지 말 것)
- 배포: `npm run deploy:dev` / `deploy:prod` (이 디렉터리의 package.json)
