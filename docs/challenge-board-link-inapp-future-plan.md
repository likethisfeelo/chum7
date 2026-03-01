# Challenge Board 링크 인앱(WebView) 전환 추후 개발 계획

- 문서 버전: 1.0.0
- 상태: Future Scope (Post-MVP)
- 대상: Frontend/App/보안

## 배경
현재 챌린지보드 링크 블록은 외부 브라우저 오픈 방식으로 운영한다. 사용자 이탈 최소화와 추적 고도화를 위해 인앱 WebView 전환을 후속 개발로 분리한다.

## 목표
1. 링크 열람 경험을 앱 내부에서 유지
2. 악성 URL/피싱 위험 최소화
3. 링크 클릭 및 체류 KPI 계측 강화

## 범위
- 링크 블록 클릭 시 in-app WebView 오픈
- 허용 URL 정책/도메인 검증
- 외부 앱 전환이 필요한 경우 fallback 처리

## 기술 고려사항
1. URL Validation
   - `https`만 허용 (초기)
   - 허용 도메인 allowlist/denylist 적용
2. WebView 보안
   - JS bridge 최소화
   - 파일 접근/팝업 제한
   - 새 창 요청 제어
3. UX
   - 상단 닫기 버튼
   - 원문 열기(외부 브라우저) 보조 버튼
4. 계측
   - `challenge_board_link_opened_inapp`
   - `challenge_board_link_opened_external`
   - `challenge_board_link_dwell_time`

## 마이그레이션 전략
- Phase A: 외부 브라우저 유지 + 이벤트만 선계측
- Phase B: 일부 사용자 대상 WebView A/B 테스트
- Phase C: 기본값 WebView 전환

## 오픈 이슈
- 앱 플랫폼(iOS/Android/Web)별 WebView 정책 차이
- 결제/인증 페이지 등 민감 URL의 외부 브라우저 강제 여부

