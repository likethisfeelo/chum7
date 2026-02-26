# Challenge-Quest V2 단계 개발 로드맵

## 목표
- 챌린지 생성 후 챌린지별 퀘스트를 다수 운영
- 생성자/그룹 기반 권한 세분화
- 조회 불가(숨김) 정책 일원화
- 참여자 퀘스트 설정 모드와 포인트 정책 확장

## 기능 플래그 제안
- `enableChallengeQuestV2`: 드롭다운 기반 챌린지-퀘스트 연동 + 권한강화
- `enableParticipantQuestConfig`: 참여자 퀘스트 설정(리크루팅 중 5회 수정)
- `enableFlexibleVerificationBundle`: 인증 게시물 조합형(텍스트 단독/텍스트+미디어)
- `enableVerificationPointPolicyV2`: 인증 조합별 포인트

## 단계별 실행안

### 1단계 (현재 반영)
- admin 퀘스트 생성 시 챌린지 ID 직접 입력 대신 드롭다운 선택
- 챌린지별 퀘스트 생성 강제
- 권한: `admins`, `productowners`, `managers`, 또는 해당 챌린지 생성자
- 챌린지 조회 API에서 숨김/비활성 챌린지 공통 필터

### 2단계
- lifecycle 권한 매트릭스 정교화
  - `admins`: 전체
  - `productowners`: 시작/중단/조회불가 가능, 물리삭제 불가
  - `managers`: 퀘스트/인증 운영만 가능
  - `creator`: 자신의 챌린지/퀘스트 운영 가능
- 조회불가 상태를 soft-hide 필드로 일원화

### 3단계
- 참여자 퀘스트 설정 모드 도입
  - 리크루팅 기간 중 최대 5회 수정
  - ACTIVE 전환 시 lock
  - 챌린지 운영 기간 동안 반복

### 4단계
- 인증 게시물 조합형 모델 도입
  - 예: `text`, `text+image`, `text+video`, `text+link`
- 느슨한 참여형 정책
  - "업로드만 하면 인정" 모드 (최소 검증)
- 생성자 정의 포인트 룰
  - 예: `text=100`, `text+image=200`

## 7번 요구사항(인증 방식) 설계 의견
현재 `verificationType` 단일 선택 구조는 확장성이 낮습니다.

권장 모델:
- `allowedProofCombos`: 허용 조합 목록
  - `TEXT_ONLY`, `TEXT_IMAGE`, `TEXT_VIDEO`, `TEXT_LINK`
- `scoringPolicy.pointsByCombo`
  - `{ TEXT_ONLY: 100, TEXT_IMAGE: 200, ... }`
- `validationMode`
  - `strict`: 조합/필수값 엄격 검증
  - `relaxed`: 업로드 성공 시 최소 검증 통과

이 구조를 쓰면 "느슨한 참여형"과 "고관여형" 챌린지를 같은 엔진에서 처리 가능합니다.
