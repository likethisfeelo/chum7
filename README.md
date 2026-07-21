# CHME (Challenge Earth with ME)

7일 챌린지 기반 습관 형성 소셜 앱 + 크리에이터 챌린지 플랫폼.

## 📚 기획 문서 (재구축 진행 중)

| 문서 | 내용 |
|------|------|
| [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md) | 서비스 기획서 — 기능 요건의 기준 |
| [`REDESIGN_PLAN.md`](./REDESIGN_PLAN.md) | 개발 기획서 — 시스템 재구축 계획 (Phase 0~6) |
| [`PAYMENT_SPEC.md`](./PAYMENT_SPEC.md) | 결제·정산·배송 상세 기획 |

현재 상태: **Phase 1 진행 중** — 신규 인프라(`infra2/`, 스택 프리픽스 `chme2-*`)를 병행 구축한 뒤
DNS 전환으로 이행한다. 현행 시스템(`infra/`, `backend/`)은 전환 완료까지 유지된다.

## 🚀 현행 시스템 배포 (전환 전까지)

```powershell
./scripts/deploy-dev.ps1    # DEV:  test.chum7.com / dev.chum7.com
./scripts/deploy-prod.ps1   # PROD: www.chum7.com / api.chum7.com
```

- 인프라 ID(CloudFront·버킷 등)의 단일 진실 원천은 `infra/config/{dev,prod}.ts`다.
  README나 스크립트에 ID를 복사해 적지 않는다 (드리프트 방지).
- 전체 스택 배포는 `infra/`에서 `npm run deploy:dev` (`cdk deploy --all`).

## 📦 리포 구조 (현행 + 재구축 병행)

```
chum7/
├── PRODUCT_SPEC.md / REDESIGN_PLAN.md / PAYMENT_SPEC.md   # 기획 문서
├── frontend/            # 사용자 PWA (React+Vite)
├── admin-frontend/      # 콘솔 (React+Vite)
├── backend/             # [현행] Lambda 소스 — 재구축 후 services/로 대체
├── infra/               # [현행] CDK 앱 (chme-*) — 재구축 후 infra2/로 대체
├── packages/            # [신규] core / api-kit / contracts / web-kit
├── services/            # [신규] 도메인 API Lambda + workers
├── infra2/              # [신규] CDK 앱 (chme2-*)
├── scripts/             # 배포·운영 스크립트
├── docs/                # 문서 단일 루트 (구 docs2→docs/core-specs, docs3·4 → docs/)
└── test/                # 통합 테스트
```

## 🛠️ 운영 스크립트

```bash
npm test                                   # 단위 테스트
npm run lint:cheer-widgets                 # 응원 대시보드 위젯 카탈로그 검증
CHALLENGES_TABLE=<t> npm run backfill:challenge-layer-policy [-- --apply]
```

---

Built with ❤️ using React, AWS CDK, TypeScript
