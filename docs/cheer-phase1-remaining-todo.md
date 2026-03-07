# Cheer Phase 1+ 확장 후 남은 TODO

## 완료 범위(이번 반영)
- 공개 인터랙션 1차: `POST /cheers/{cheerId}/reply`, `POST /cheers/{cheerId}/reaction`
- 인터랙션 레이트 리밋 1차: reply/reaction 분당 요청 제한(환경변수 기반)
- 통계 API 확장: `GET /cheers/stats` with `period=all|day|week|month|challenge`
- CheerStats 하이브리드 조회: bucket 우선 + 실시간 fallback(`source` 필드 제공)
- CheerStats 적재 파이프라인 1차: 배치 materializer Lambda + 1시간 스케줄 트리거
- materializer 실패 재처리 기반: UnprocessedItems 재시도/백오프 + dry-run + 범위 백필(fromIso/toIso)
- `period=challenge` 검증 강화: challenge 존재 + 참여자 접근 검증
- 투데이 페이지 UX 확장: 리액션/답장 UI + 기간 필터 통계 카드

## 남은 TODO

### P0 (바로 다음)
1. CheerStats 대용량 백필 스크립트/운영 런북 정리(이벤트 파라미터 표준화 포함)
2. 인터랙션/통계 구조화 로그 대시보드 연동(요청수, 4xx, 5xx, latency p95)
3. 레이트 리밋 우회/분산 요청 대응(고정 윈도우 → 토큰 버킷 등)

### P1 (이번 스프린트 내)
1. 프론트에서 period 입력 UX 개선(week picker, month picker)
2. 답장 수정/삭제 정책 확정(현재는 1회 작성 후 고정)
3. sender 측 조회 페이지에서 reply/reaction 표시 강화

### P2 (차기)
1. 익명→공개 전환 정책과 reply/reaction 노출 규칙 연동
2. `/cheers/stats`를 CheerStats 버킷 테이블로 이관
3. 공개 인터랙션(스레드 답장/다중 리액션) 확장

## 릴리즈 체크
- feature flag 단계 배포 준수: DEV 100% → 내부계정 5% → 20/50/100%
- 롤백 기준: 오류율/지연/티켓 불일치/응답 포맷 깨짐
