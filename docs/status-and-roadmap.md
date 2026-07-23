# CHME 개발 현황 및 로드맵

> 갱신: 2026-07-23 · 브랜치: `claude/system-architecture-redesign-9t5o17` (main 대비 앞섬, **미배포**)
> 범위: 실배포 복구 → 신원/익명 정책 → 관계·친구·아카이브 → 친구 모델 v2

---

## 0. 현재 상태 한눈에
- **코드: 완료·커밋·푸시.** 브랜치에 다 있음. 타입·해당 테스트 통과.
- **배포: 미완.** P1-2 이후 전부 prod 미반영. 다음 배포 필요(§4).
- **친구 기능: `FRIENDS_ENABLED=false`(순차 출시)** — 데이터 쌓인 뒤 켤 예정.

---

## 1. 완료 — 실배포 복구 (도메인 컷오버)
prod DNS 전환 중 발견·수정한 실장애들.
- CloudFront CNAME 충돌 해소 스크립트(`cutover-free-cnames.ps1`), apex→www 301, S3 버킷명 계정 접미사, 배포 순서 버그(env→빌드), stateful 위험 감지 섹션 한정.
- **CORS 프리플라이트 실패**: 라우트에서 OPTIONS 제외(API GW가 자동 응답).
- **목록 엔드포인트 전멸(404)**: `{proxy+}`가 맨 경로를 못 받던 문제 → 정확+프록시 경로 둘 다 등록.
- admin 기능 복구: 모집 탐색 노출(`recruitingStartAt` 별칭), 보드 저장 경로, 퀘스트 생성/수정 배선, 비밀번호 찾기.

## 2. 완료 — 신원/익명 정책 (P0·P1)
점검 문서: `docs/plaza-anonymous-audit.md`
- **P0-1** `ANON_ID_SALT` 시크릿·주입·로더 (보드 댓글 500 해소).
- **P0-2** 마당 퍼블릭 응답에서 `authorId`(실 userId) 제거.
- **P1-1** 비기능 익명 ON/OFF 토글 제거.
- **P1-2** 인증글 표면 일일 활동명 통일 + `userId/userName` 유출 차단(익명 엔진 `@chum7/core` 공유).
- **P1-3** 마당 댓글 게시물별 `아무개N`(동시성 카운터).
- **P1-4** 로그인 댓글 목록 + `isMine` 정상화.
- **P1-5** 마당 댓글 삭제.
- **P1-6** 챌린지 리더/참여자 작성 모드(서버 검증).

## 3. 완료 — 관계·친구·아카이브
설계: `docs/relationship-archive-design.md`, `docs/relationship-p2-stage-a-notes.md`, `docs/friend-model-v2.md`

**P2 — 상호작용 원장·친구 추천**
- interaction-projector 워커: `chme.*` 이벤트 → graph 테이블 원장/집계(멱등, DLQ).
- 친구 API·프론트(`/friends`).

**P3 — 관계 아카이브**
- 요약(자동)·타임라인(상호 동의)·실콘텐츠 참조(상호 동의+글로벌 플래그)·접근제어·감사 로그.
- 콘텐츠 삭제 → 원장 동기화(gsi2 SRC#), 타임라인 당시 활동명 스냅샷.

**친구 모델 v2 (세계관 확정)**
- **정체성 사다리**: 공개(마당·챌린지)는 영원히 익명 / 친구 사적 표면(알림·프로필·아카이브)만 실명.
- 방향별 카운트(`outCount`/`inCount`), **양방향 임계값 자격**(초기 100·조정 가능), **상호 신청 자동 친구**(수락 단계 없음).
- 친구 알림 실명 식별("친구 OO님이 반응했어요", 공개는 익명 유지), 친구 프로필 피드 상호 열람.
- 순차 출시 플래그 `FRIENDS_ENABLED`.

---

## 4. 🚀 배포 (지금 필요)
```powershell
git checkout main; git fetch origin
git merge origin/claude/system-architecture-redesign-9t5o17
git push origin main
.\scripts\deploy-chum7.ps1 -Stage prod
```
- 신규 워커(interaction-projector) 생성 → **배포돼야 관계 데이터가 쌓이기 시작**.
- salt는 이미 주입됨(dev/prod). VAPID도 완료.

### 배포 후 검증
1. 마당 댓글 `아무개N`·삭제, 인증 피드 `수달N`·리더 👑, 보드 댓글(500 없음).
2. 마이 → 친구 진입(단, `FRIENDS_ENABLED=false`면 후보 빈 상태 정상).
3. projector 로그·DLQ 확인(이벤트 정상 소비).

---

## 5. ⚙️ 출시 스위치 (config, `infra2/config/stages.ts`)
| 플래그 | 기본 | 켜는 시점 |
|---|---|---|
| `friendsEnabled` | false | 관계 데이터 축적 후 친구 기능 오픈 |
| `friendEligibilityThreshold` | 100(각 방향) | 필요 시 하향(초기 높게) |
| `archiveFullContentEnabled` | false | 아카이브 전체 콘텐츠(단계 E) 검증 후 |

---

## 6. 앞으로 할 일

### 6.1 배포·검증 (최우선)
- [ ] 전체 배포(§4) + 실화면 검증.
- [ ] projector가 원장/집계 쌓는지 확인 후 `friendsEnabled` on 시점 결정.

### 6.2 UI 폴리시 (배포 후 우선순위 재조정) — `docs/relationship-ui-review.md`
- [x] 친구 요청 알림 → `/friends` 딥링크. *(+ 워커 알림 전반 type/title/body/deepLink 정상화)*
- [x] 아카이브 타임라인 "더 보기" 페이지네이션(커서 왕복 배선).
- [x] 마당 CommentSection 삭제/배지 레이아웃(헤더행+본문 분리, ✕ 아이콘), 리더 모드 안내.
- [x] 프로필에 "친구" 배지(응답 `isFriend` 사용).
- [ ] 로딩/빈 상태 스켈레톤 통일. *(FriendsPage/ArchivePage 텍스트 상태 — 배포 후 폴리시)*
- [ ] 추천 사유 카피 실사용 후 다듬기.

### 6.3 기능 후속
- [x] **친구 알림 볼륨**: bundle 규칙 확인 완료 — social은 targetId 단위 묶음,
      단건 친구 반응은 실명 문구, 다건은 집계. 추가 튜닝 불필요.
- [ ] **단계 E 프론트**: 글로벌 플래그 켤 때 원본 딥링크(원본 보기) 버튼.
- [x] **친구 요청 배지**: 마이 "친구" 버튼에 받은 신청 수 배지.
- [x] **차단·해제 시** 관계 정리: block도 집계 `isFriend` 해제(delete와 정합).
- [ ] bulletin 댓글 등 기타 표면의 활동명 스냅샷(현재 생략).

### 6.4 견고성·정합성
- [x] 친구 신청 판정 로직 도메인 분리 + **단위테스트**(양방향 임계값·상호신청·우선단락).
- [ ] 친구/아카이브 **라우트 통합테스트**(DDB 목 하네스 필요 — 별도 도입).
- [ ] 감사 로그 CloudWatch → `ops` 테이블 이관(민감 조회 영구 보관 필요 시).
- [ ] `co_challenge` 상한(25) 넘는 대형 챌린지 배치/비동기 처리(현재 상한+로깅).
- [ ] 추천 후보 조회가 사용자 PAIRSTAT 파티션 전체 스캔 — 규모 커지면 자격 gsi 도입.

### 6.5 레거시 정리 (재설계 마무리)
- [ ] 구 시스템(chme-*) 스택·리소스 철거(Phase 5 잔여).
- [ ] pre-existing 레거시 테스트 실패(`test/backend/*`, ~30개) 정리 또는 제외.

---

## 7. 참고 문서
| 문서 | 내용 |
|---|---|
| `plaza-anonymous-audit.md` | 익명·마당 점검·기획 |
| `relationship-archive-design.md` | 관계·아카이브 설계·로드맵 |
| `relationship-p2-stage-a-notes.md` | 원장 구현·가중치·아카이브 정책 |
| `friend-model-v2.md` | 친구 모델 v2(자격·상호신청·정체성 사다리) |
| `relationship-ui-review.md` | UI 검토·개선 계획 |
| `status-and-roadmap.md` | (이 문서) 전체 현황·로드맵 |
