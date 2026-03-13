# 챌린지 영상 인증(60초 트림) 기능 기획안 (재점검)

## 1. 현재 상태 점검 (코드 기반)

- 업로드 URL API는 영상 MIME(`mp4`, `webm`, `quicktime`)를 허용하고, 현재 영상 최대 파일 크기는 **500MB**로 설정되어 있습니다.
- 업로드 URL API는 presigned URL만 발급하며, 영상 길이(duration) 자체를 서버에서 재계산하지는 않습니다.
- 인증 제출 API는 `videoDurationSec`를 받아 최대 60초 제한을 적용합니다.
- 퀘스트 제출 검증도 `videoDurationSec` 기반으로 최대 길이를 검사합니다.

즉 현재는 **"영상 업로드 + 메타데이터 기반 길이 검증"은 가능**하지만,
**"시작/끝 지점 편집을 통한 자유 트림 UX"와 "실측 기반 신뢰성 강화"가 미흡한 상태**입니다.

---

## 2. 목표

1. 사용자가 영상 인증 업로드 전에 시작점/끝점을 조절해 **60초 이내로 자유 트림**할 수 있게 한다.
2. 서버는 presign/검증 중심으로 유지하여 부하를 낮춘다.
3. 모바일 환경(불안정 네트워크/iOS 제약)에서도 실패율을 줄이고 UX를 개선한다.

---

## 3. 핵심 원칙

- 트랜스코딩 서버 상시 운영은 지양하고 **클라이언트 트림 우선**으로 간다.
- 서버는 동기 경로에서 경량 검증만 수행하고, 필요 시 비동기 검증으로 신뢰성을 보강한다.
- 피드 재생은 자동재생 정책/데이터 사용량을 고려해 **가시영역 기반 재생 + metadata preload**를 기본값으로 한다.

---

## 4. 구현 전략

### 4.1 클라이언트 트림 및 업로드 기술 스택 (추천)

#### A) 영상 처리 엔진: `ffmpeg.wasm`

- 브라우저 내 트림/인코딩 수행에 가장 범용적.
- Vite 환경에서는 Cross-Origin Isolation 구성이 필요함.
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Cross-Origin-Opener-Policy: same-origin`
- 로컬 개발 편의: `vite-plugin-cross-origin-isolation` 적용 권장.

#### B) 업로드 프레임워크: `Uppy` (+ `@uppy/aws-s3`)

- presigned URL 연동이 쉽고, 업로드 진행률/오류 처리 UX가 우수.
- 모바일 네트워크 불안정 시 재시도/복구 경험이 좋음.
- 권장 플로우:
  1. `on('file-added')`에서 영상 메타 확인
  2. 트림 구간 선택 및 `ffmpeg.wasm` 처리
  3. 결과 파일만 업로드 큐에 주입

#### C) 트림 UI: `react-range` + `<video>` (필요 시 `video.js`)

- 오래된 트리머 라이브러리 의존보다, 슬라이더 + seek 동기화 직접 구현이 유지보수에 유리.
- 최소 규칙:
  - `0 <= trimStartSec < trimEndSec`
  - `trimEndSec - trimStartSec <= 60`

### 4.2 API/계약 확장

- `/verifications/upload-url` 요청 확장(제안):
  - `mediaKind: 'video' | 'image'`
  - `trimStartSec?: number`
  - `trimEndSec?: number`
  - `videoDurationSec?: number`
- `/verifications` 제출 확장(제안):
  - `videoDurationSec`(필수 정책 유지)
  - `trimStartSec`, `trimEndSec` (옵션)

### 4.3 서버 검증

- 동기 검증:
  - `videoDurationSec <= 60`
  - trim 구간값의 수학적 유효성 검증
- 비동기 검증(선택):
  - S3 ObjectCreated → Lambda로 메타 추출
  - 60초 초과/비정상 포맷 시 `invalid_media` 마킹

---

## 5. 피드(Feed) 재생 전략 (UX/성능)

### 5.1 가시영역 기반 재생

- `Intersection Observer`로 뷰포트 점유율 50~70% 이상일 때만 재생.
- 화면 이탈 시 즉시 `pause()`.
- 자동재생은 기본 `muted` 유지, 탭 시 unmute.

### 5.2 로딩 최적화

- 피드 리스트 영상은 `preload="metadata"` 사용.
- `poster` 이미지를 적극 사용(서버 생성 썸네일 또는 클라이언트 트림 시 추출).
- 리스트에서는 메타/썸네일 위주, 상세 진입 시 본격 버퍼링.

### 5.3 인터랙션

- 60초 내 짧은 영상 특성상 `loop` 기본 적용.
- 모바일 체류시간 개선용 제스처(예: double-tap like)는 Phase 2+에서 검토.

---

## 6. 모바일 웹 함정 및 대응

1. **iOS 저전력 모드**
   - autoplay 실패 가능성 높음.
   - fallback으로 명시적 재생 버튼 노출.
2. **인라인 재생 강제**
   - `<video playsinline muted>` 기본값 적용.
3. **업로드 대기 UX**
   - 업로드 진행률, 남은 시간, 재시도 버튼을 반드시 표시.

---

## 7. 용량 정책 재점검 (60초 기준)

60초 영상 대략 용량: `비트레이트(Mbps) × 7.5 = MB`

- 1080p 30fps (8~16Mbps): 약 60~120MB
- 1080p 60fps (12~24Mbps): 약 90~180MB
- 4K 30fps (20~60Mbps): 약 150~450MB

### 7.1 정책 제안

- **백엔드/클라이언트 공통 하드리밋: 500MB**
- **권장 목표 용량: 25MB 이하**(트림/압축 후, 업로드 속도/성공률 개선 목적)
- 안내 문구/에러 메시지/정책 문서는 모두 500MB 기준으로 통일

> 운영상 권장 용량(25MB)은 성능 가이드이고, 강제 차단 기준은 500MB로 단일화합니다.

---

## 8. 롤아웃 계획

1. 스테이징에서 iOS Safari/Android Chrome 우선 검증
2. 10% 트래픽 카나리
3. KPI 모니터링
   - 업로드 실패율
   - 업로드 완료 시간 p95
   - 평균 파일 크기
   - 피드 영상 시작 시간(첫 프레임) p95
4. 안정화 후 전체 확장

---

## 9. 구현 백로그 (우선순위)

### P0

1. 트림 UI(시작/끝 + 60초 검증)
2. `ffmpeg.wasm` + Uppy 연동 PoC
3. 업로드 진행률/오류/재시도 UX
4. 피드 `Intersection Observer` autoplay/pause 적용

### P1

1. API 스키마에 trim 메타 반영
2. 서버 검증 보강 및 에러코드 정리
3. poster/metadata preload 전략 적용

### P2

1. S3 이벤트 기반 비동기 실측 검증
2. `invalid_media` 후속 UX(재업로드 유도)
3. 모바일 저사양 fallback 고도화

---

## 10. 현 코드 연결 포인트

- 업로드 제한/타입 처리: `backend/services/verification/upload-url/index.ts`
- 인증 제출 길이 제한: `backend/services/verification/submit/index.ts`
- 퀘스트 제출 검증: `backend/shared/lib/quest-submit-validation.ts`

위 3개를 중심으로 계약 확장 + UX 보강 + 단계적 검증을 진행하면, 서비스 영향도를 낮춘 상태에서 기능 완성도를 올릴 수 있습니다.

---

## 11. PHASE별 실행 기획 (개발 착수용)

### Phase 0: 기술검증/환경준비 (1주)

**목표**

- ffmpeg.wasm + Uppy 조합이 현재 프론트/Vite 환경에서 안정적으로 동작하는지 확인
- Cross-Origin Isolation 설정 리스크를 조기 제거

**주요 작업**

1. `vite-plugin-cross-origin-isolation` 적용 PoC
2. 샘플 영상(1080p/4K) 기준 트림 성능 측정(저사양/고사양 기기)
3. Uppy + Presigned URL 업로드 연결 최소 기능 구현

**완료 조건(DoD)**

- 60초 트림 파일 생성/업로드 end-to-end 성공
- iOS Safari/Android Chrome 최소 1개 기기씩 통과
- 빌드/배포 파이프라인에서 COOP/COEP 헤더 적용 확인

### Phase 1: MVP 출시 (2주)

**목표**

- 사용자에게 "시작/끝 조절 + 60초 이내 트림 + 업로드 진행률" 기본 경험 제공

**주요 작업**

1. 트림 UI(슬라이더 + 영상 seek 동기화) 구현
2. 60초 초과 사전 차단 및 에러 메시지 정리
3. Uppy 업로드 진행률/실패 재시도 UI 반영
4. 피드에서 Intersection Observer autoplay/pause + `preload="metadata"` 적용

**완료 조건(DoD)**

- 트림 후 업로드/인증 제출 성공률 목표치 달성(스테이징 기준)
- 피드 초기 로딩/재생 시작 시간 KPI 기준 충족
- 주요 회귀(기존 이미지/텍스트 인증) 없음

### Phase 2: 계약/검증 강화 (1~2주)

**목표**

- API/DB 계약을 정리하고 서버 검증 신뢰성 강화

**주요 작업**

1. `/verifications/upload-url`, `/verifications`에 trim 메타 필드 반영
2. 서버에서 trim 구간값 유효성 검증 및 에러코드 표준화
3. 운영 로그/대시보드 추가(업로드 크기, 실패 사유, 처리시간)

**완료 조건(DoD)**

- 신규 필드 포함 요청/응답 계약 문서화 완료
- 실패 케이스(길이 초과, 잘못된 trim 범위, MIME 오류) 테스트 통과
- 운영에서 원인 추적 가능한 로그 체계 확보

### Phase 3: 비동기 실측 검증 + 운영최적화 (2주)

**목표**

- 클라이언트 메타 의존도를 낮추고 운영 안정성/비용 효율 개선

**주요 작업**

1. S3 ObjectCreated 기반 비동기 길이 재검증 Lambda 구현
2. `invalid_media` 상태 처리 UX(재업로드 유도) 반영
3. poster 생성/저장 전략 고도화(서버 또는 클라이언트 추출)

**완료 조건(DoD)**

- 비동기 검증 파이프라인 장애 없이 작동
- 잘못된 파일 자동 식별/차단 가능
- 피드 데이터 사용량/재생 성능 개선 지표 확보

### Phase 4: 점진 배포/튜닝 (상시)

**목표**

- 실서비스 지표 기반으로 정책/UX를 안정화

**주요 작업**

1. 10% → 30% → 100% 카나리 확장
2. 용량 정책(500MB 하드리밋, 25MB 권장 가이드) 효과 측정
3. 기기/브라우저별 장애 패턴 대응

**완료 조건(DoD)**

- 업로드 실패율/재생 실패율이 목표 범위 유지
- 고객 문의/CS 이슈 급증 없음
- 운영팀/QA 승인 후 정식 전환
