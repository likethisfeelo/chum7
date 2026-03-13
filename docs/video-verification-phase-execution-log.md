# 영상 인증 60초 트림 기능 - PHASE 실행 로그

## 원칙

- 한 번에 하나의 PHASE만 진행한다.
- 각 PHASE는 DoD(완료조건) 충족 후 다음으로 넘어간다.
- 본 로그는 개발/QA/운영 커뮤니케이션의 단일 소스(SoT)로 사용한다.

## 현재 상태

- 현재 진행 PHASE: **Phase 4 (점진 배포/튜닝)**
- 다음 PHASE: 운영 데이터 기반 정책 미세조정

## Phase별 진행 현황

### Phase 0 — 기술검증/환경준비

- 상태: **완료**
- 완료 일시: 2026-03-12
- 이번 반영 내용:
  1. Vite dev/preview에 Cross-Origin Isolation 헤더 적용
     - `Cross-Origin-Opener-Policy: same-origin`
     - `Cross-Origin-Embedder-Policy: require-corp`
  2. ffmpeg.wasm 도입 전제 조건(브라우저 SharedArrayBuffer) 충족 기반 확보

- 검증 결과:
  - 프론트 빌드 성공

- 다음 PHASE 진입 조건:
  - Phase 1 트림 UI/업로드 UX 개발 착수 승인

### Phase 1 — MVP 출시

- 상태: **완료**
- 완료 일시: 2026-03-12
- 이번 반영 내용:
  1. 인증 업로드 UI에 진행률 표시(%) 추가
  2. 프론트 영상 업로드 상한 500MB로 백엔드와 일치
  3. 챌린지 피드 영상에 가시영역 기반 autoplay/pause + `preload="metadata"` 적용
  4. 영상 트림 범위 선택 UI(시작/끝 슬라이더, 60초 범위 표시) 추가
  5. 업로드 실패 시 "업로드 재시도" UX 추가

- 검증 결과:
  - 프론트 빌드 성공

### Phase 2 — 계약/검증 강화

- 상태: **완료**
- 완료 일시: 2026-03-12
- 이번 반영 내용:
  1. `/verifications/upload-url`에 `mediaKind`, `trimStartSec`, `trimEndSec`, `videoDurationSec` 스키마 반영
  2. 업로드 URL API에서 trim 구간 유효성 검증(`INVALID_TRIM_RANGE`) 추가
  3. `/verifications` 제출 스키마/저장모델에 trim 메타 반영
  4. trim 검증 케이스 백엔드 테스트 추가

- 검증 결과:
  - 프론트 빌드 성공
  - trim 검증 관련 백엔드 테스트 통과

### Phase 3 — 비동기 실측 검증 + 운영최적화

- 상태: **완료**
- 완료 일시: 2026-03-12
- 이번 반영 내용:
  1. S3 ObjectCreated 트리거 기반 media-validation Lambda 추가
  2. 업로드 객체 메타(trim/duration)를 읽어 비동기 검증 로그(`media_validation_result`) 적재
  3. 공통 media metadata 평가 유틸 및 단위테스트 추가
  4. 검증 결과를 verification 레코드 상태(`mediaValidationStatus`)로 업데이트 연동
  5. 피드/인증 UX에서 invalid/pending 상태 메시지 노출
  6. invalid_media 전용 재업로드 CTA(피드에서 바로 영상 재인증 시작) 반영

- 검증 결과:
  - 프론트 빌드 성공
  - media/trim 관련 백엔드 테스트 통과

### Phase 4 — 점진 배포/튜닝

- 상태: **진행중**
