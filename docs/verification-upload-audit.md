# 챌린지 인증 업로드/링크 기능 점검 리포트

작성일: 2026-03-11

## 1) 현재 업로드 흐름(영상/이미지)

1. 프론트엔드(`InlineVerificationForm`, `QuestSubmitSheet`)에서 파일 선택 후 `/verifications/upload-url` 호출
2. 백엔드 `verification/upload-url` Lambda가 Presigned PUT URL 발급
3. 프론트엔드가 Presigned URL로 S3에 직접 PUT 업로드
4. 업로드된 CloudFront URL(`https://www.chum7.com/uploads/...` 또는 `https://test.chum7.com/uploads/...`)을 `/verifications` 또는 `/quests/{id}/submit`에 저장

## 2) 실제 저장 위치/서버

- 버킷(DEV): `chum7-dev-uploads`
- 버킷(PROD): `chum7-prod-uploads`
- 인프라에서 `UPLOADS_BUCKET` 환경변수로 각 Lambda에 주입
- 경로 규칙: `{userId}/{challengeId}/{timestamp}-{random}.{ext}`

즉, 미디어 원본은 S3 업로드 버킷에 저장되고, 앱에서는 CloudFront 경유 URL(`/uploads/...`)을 사용합니다.

## 3) 허용 파일 형식(확장자/MIME)

`/verifications/upload-url` 기준 허용 MIME:

- 이미지: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `image/gif`
- 영상: `video/mp4`, `video/webm`, `video/quicktime`(= `.mov`로 저장)

프론트는 `image/*`, `video/*`로 파일선택을 열지만, 서버는 위 MIME 화이트리스트로 최종 제한합니다.

## 4) 파일 크기/길이 제한 점검

- **파일 크기(MB) 제한:** 현재 인증 업로드 경로에는 명시적 검증이 없습니다.
  - Presigned PUT 단계에서 `Content-Length` 제한을 강제하지 않음
  - 프론트에서도 파일 크기 체크 로직 없음
- **영상 길이 제한:** 있음
  - 챌린지 인증: 최대 60초(프론트/백엔드 모두 검증)
  - 퀘스트 인증: 기본 60초, `verificationConfig.maxDurationSeconds`로 조정 가능

## 5) 링크 인증 표시(OG/썸네일) 현황

현재 링크 인증은 목록/피드 UI에서 **URL 텍스트 링크만 출력**하며, OG 태그를 읽어 제목/설명/썸네일 카드로 렌더링하는 기능은 없습니다.

## 6) 확인된 갭(gap)

1. 링크 OG 미리보기 부재(요구사항 미충족)
2. 인증 업로드 파일 크기 제한 부재(운영비/장애 리스크)
3. 링크 안전성 검증(도메인 allowlist, SSRF 대응) 부재

## 7) 권장 보완안(우선순위)

### P0
- 업로드 파일 크기 제한 도입
  - 프론트: 업로드 전 MB 체크 + 에러 메시지
  - 백엔드: Presigned 정책 또는 업로드 후 검증/거부 처리

### P1
- 링크 OG 미리보기 API 추가
  - 서버에서 링크 fetch + OG 파싱(타임아웃/리다이렉트 제한/사설 IP 차단)
  - 응답: `title`, `description`, `image`, `siteName`
  - 프론트: 링크 카드 컴포넌트로 작은 썸네일(예: 56~72px 정사각) + 제목 1줄 + 도메인 표시

### P2
- 링크 검증 강화
  - 허용 프로토콜 `https` 고정
  - 필요 시 도메인 allowlist(예: youtube, instagram 등)
  - 캐시(짧은 TTL)로 외부 호출 부하 감소

## 8) 제안 UI 스펙(작은 썸네일)

- 카드 높이 72px 내외
- 좌측 썸네일: 64x64 (`object-cover`, `rounded-md`)
- 우측 텍스트: 제목 1줄 + 도메인 1줄
- OG 이미지 없으면 기본 링크 아이콘 플레이스홀더

