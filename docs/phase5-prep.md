# Phase 5 준비 문서 (운영 반영 전 체크리스트)

작성일: 2026-02-28  
범위: Phase 4까지 반영 완료 상태에서, 테스트 서버 검증/운영 이관을 위한 준비 항목 정리

## 1) 배포 대상 요약

- Backend/API
  - 개인 퀘스트 제안: submit/my/revise/review/list
  - 알림: list/mark-read
  - remedy policy 적용/강화
  - lifecycle 전환 시 proposal 만료 + 참여자 알림
- Infra/CDK
  - `personal-quest-proposals` 테이블 + GSI
  - `notifications` 테이블 + GSI
  - 신규 Lambda 라우팅/권한
- Frontend
  - 참여자: ChallengeDetail/ME/VerificationSheet/Feed
  - 어드민: 제안 심사함/알림함/생성 화면 정책 입력

---

## 2) 테스트 서버 배포 준비

> 현재 저장소 기준 DEV 엔드포인트
- Web: `https://test.chum7.com`
- API: `https://dev.chum7.com`

### 2-1. 사전 점검
- [ ] AWS 자격증명 유효 (`aws sts get-caller-identity`)
- [ ] S3 버킷 접근 가능 (`chme-dev`, `chum7-dev-uploads`)
- [ ] CloudFront invalidation 권한 확인 (`ESKW3DSSHIUK9`)
- [ ] CDK deploy 권한 확인

### 2-2. 배포 명령 (운영자 실행용)
PowerShell 기준(리포지토리 기본 제공 스크립트):

```powershell
./scripts/deploy-dev.ps1
```

수동 배포(동등 절차):
1. `frontend` 빌드 (development mode)
2. `frontend/dist` → `s3://chme-dev` 동기화
3. CloudFront invalidation
4. CDK deploy (`--context stage=dev --require-approval never`)

---

## 3) 테스트 서버 기능 검증 시나리오

### A. Remedy Policy
- [ ] strict: remedy 호출 시 `REMEDY_NOT_ALLOWED (400)`
- [ ] limited(1일): 1회 성공 후 재시도 시 `REMEDY_MAX_REACHED (409)`
- [ ] limited(2일): 실패 3일 중 선택 2일 복구 가능
- [ ] open: 정상 복구 가능

### B. Personal Quest Proposal
- [ ] personalQuestEnabled=false 챌린지는 제안 입력/제출 불가
- [ ] autoApprove=true: 제출 즉시 approved
- [ ] autoApprove=false: pending + 리더 알림
- [ ] reject → revise → revision_pending 전환 확인
- [ ] revisionCount 한도 초과 시 expired 처리
- [ ] preparing→active 전환 시 pending/revision_pending/rejected 만료 + 참여자 알림

### C. Notifications
- [ ] `/users/me/notifications` 미읽음 기본 조회
- [ ] `/users/me/notifications/{id}/read` 읽음 처리
- [ ] 어드민 알림함 페이지 반영 및 뱃지 갱신

### D. Frontend UX
- [ ] VerificationSheet에서 날짜 필드 제거 확인
- [ ] Feed 시간 표기가 실천 시각 기준(`practiceAt/performedAt`)인지 확인
- [ ] ME에서 개인 퀘스트 상태(검토중/승인/수정필요/만료) 노출 및 rejected 수정 재제출 확인

---

## 4) Phase 5 착수 전 의사결정 잔여 항목

- [ ] 챌린지 시작 시 rejected 제안자 최종 정책 (disqualified vs 리더퀘스트만 수행)
- [ ] `allowBulk` API 확장 방식 (배열 endpoint vs 별도 bulk endpoint)
- [ ] D-1 경고 알림 발송 주체 (lifecycle-manager vs 별도 scheduler)
- [ ] 리더 식별 규칙 최종화 (`createdBy` 고정 vs 다중 리더)

---

## 5) 이번 세션 환경 제한 사항

- 이 실행환경에는 `aws` CLI가 설치되어 있지 않아 직접 DEV 배포를 수행하지 못함.
- `pip` 경유 awscli 설치도 네트워크/프록시 제약(403)으로 실패.
- 따라서 코드 반영/빌드 검증까지만 수행하고, 실제 DEV 반영은 운영자 환경에서 위 배포 절차로 진행 필요.
