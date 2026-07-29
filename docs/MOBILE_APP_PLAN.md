# 웹앱 + 네이티브 앱 동시 지원 계획 (Capacitor)

> 목표: **하나의 코드베이스(현 `frontend/` React+Vite PWA)** 로 웹앱과 iOS/Android 네이티브 앱을
> 동시에 제공한다. 네이티브는 **Capacitor**로 기존 웹 빌드를 감싸 스토어에 올린다 (UI 재작성 없음).

## 0. 전제 · 결정값 (가정)

아래는 현재 **가정한 기본값**이다. 바꾸려면 이 표만 고치고 영향 섹션을 참고한다.

| # | 항목 | 가정값 | 바뀌면 영향 |
|---|------|--------|-------------|
| 1 | 네이티브 방식 | **Capacitor** (웹 코드 재사용) | React Native면 UI 전면 재작성 → 이 문서 폐기 수준 |
| 2 | 배포 스토어 | **iOS + Android 둘 다** `[확정 필요]` | Android만이면 애플 로그인·IAP·$99 불필요 |
| 3 | 푸시 | **네이티브 푸시(APNs/FCM)** `[확정 필요]` | 웹푸시로 충분하면 §5 생략 |
| 4 | 인앱 결제 | **실물·서비스만(외부 PG)** `[확정 필요]` | 디지털 재화 판매면 애플/구글 IAP 의무(수수료 15~30%) |

### 현재 상태 (재확인)
- `frontend/`는 이미 **PWA** (Vite + `vite-plugin-pwa`, `sw.js`/manifest 존재) → **웹앱은 이미 됨**.
- 인증: **AWS Cognito** (이메일/비밀번호 + 방금 추가한 **Google/Kakao 소셜 로그인**, Hosted UI 팝업).
- 푸시: **Web Push(VAPID)** — `services/workers/notification-worker` 발송, `chme2-<stage>/vapid` 시크릿.
- 결제: `PAYMENT_SPEC.md` (PG·정산·배송) — `commerce-api`.

---

## 1. ⚠️ 먼저 알아야 할 3가지 (스토어·정책 리스크)

1. **애플 "Sign in with Apple" 의무** — 구글/카카오 등 서드파티 소셜 로그인을 제공하는 **네이티브 iOS 앱**은
   애플 로그인도 **반드시 제공**해야 심사를 통과한다. → iOS로 가면 **애플 로그인 추가 작업 필요**
   (Cognito는 애플을 네이티브 IdP로 지원하므로 붙이는 것 자체는 어렵지 않음. 단 Apple Developer 유료 필요).
2. **애플/구글 인앱결제(IAP)** — 앱 안에서 **디지털 재화·구독**을 팔면 IAP 의무 + 수수료 15~30%.
   **실물 상품·오프라인 서비스**는 기존 PG(카드 등) 사용 가능. → 현재 커머스 성격 확인 필요 `[확정 필요]`.
3. **소셜 로그인 팝업이 WebView에선 다르게 동작** — 지금 웹은 `window.open` 팝업으로 OAuth를 한다.
   네이티브 WebView에선 팝업이 막히거나 리다이렉트 복귀가 안 되므로,
   **커스텀 URL 스킴 딥링크**(`chum7://auth/callback`) + 인앱 브라우저 방식으로 분기해야 한다 (§4).

---

## 2. Capacitor 도입 (뼈대)

- [ ] `frontend/`에 Capacitor 추가: `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`
- [ ] `capacitor.config.ts` 작성
  - `webDir: 'dist'` (Vite 빌드 산출물), `appId: 'com.chum7.app'`, `appName: 'chum7'`
  - `server.androidScheme: 'https'` (WebView origin 안정화)
- [ ] `npx cap add ios` / `npx cap add android` → `frontend/ios`, `frontend/android` 생성
- [ ] 빌드 파이프라인: `npm run build` → `npx cap sync` → Xcode/Android Studio 열기
- [ ] `.gitignore`에 네이티브 빌드 산출물·서명 파일 제외 규칙 추가
- [ ] 앱 아이콘·스플래시(`@capacitor/assets`로 생성), 상태바(`@capacitor/status-bar`), 세이프에어리어 CSS 점검

## 3. 웹 코드가 WebView에서 안전하게 돌도록 정리

- [ ] **API 베이스 URL 고정** — `import.meta.env.VITE_API_URL`이 상대경로가 아닌 절대 URL(`https://api.chum7.com`)인지 확인
      (WebView는 오리진이 `capacitor://`/`https://localhost`라 상대경로 API 호출이 깨질 수 있음)
- [ ] **딥링크 라우팅** — `BrowserRouter`가 커스텀 스킴 복귀 시 경로를 못 잡는 케이스 점검, `@capacitor/app`의
      `appUrlOpen` 리스너로 딥링크 → 라우터 push 연결
- [ ] **외부 링크**는 `@capacitor/browser`로 열기(앱 이탈 방지)
- [ ] 파일/카메라 업로드(인증 사진)가 WebView에서 되는지 확인, 필요 시 `@capacitor/camera` 사용
- [ ] `localStorage` 토큰 저장 유지 가능하나, 민감도 높으면 `@capacitor/preferences`(네이티브 보안 저장)로 이전 검토

## 4. 소셜 로그인 — 네이티브 분기 (방금 만든 Cognito 연동 재사용)

> 웹은 지금의 팝업 방식 유지. 네이티브만 딥링크 방식으로 분기한다.

- [ ] **커스텀 URL 스킴 등록**: iOS `Info.plist` URL Types + Android intent-filter → `chum7://auth/callback`
- [ ] **Cognito 콜백 URL 추가** — `infra2/config/stages.ts`의 `socialLogin.callbackUrls`/`logoutUrls`에
      `chum7://auth/callback` 추가 후 재배포
- [ ] **CORS 허용 오리진 추가** — `stages.ts`의 `cors.allowOrigins`에 `capacitor://localhost`,
      `https://localhost`, (Android) `http://localhost` 추가 (토큰 교환 fetch가 CORS로 막히지 않게)
- [ ] **프론트 분기** — `frontend/src/features/auth/social.ts`
  - `Capacitor.isNativePlatform()`로 분기
  - 네이티브: `@capacitor/browser`(iOS는 `ASWebAuthenticationSession` 계열)로 Hosted UI 열기 →
    `chum7://auth/callback?code=...` 딥링크로 복귀 → `appUrlOpen`에서 code 파싱 → 기존 `exchangeCode` 재사용
  - PKCE·state·토큰 교환 로직은 그대로 공유
- [ ] **[iOS] 애플 로그인 추가** `[확정 필요: iOS 배포 시 필수]`
  - Apple Developer($99/년) → Services ID/Team ID/Key ID/.p8
  - Cognito에 Apple IdP 추가(네이티브 지원) + `stages.ts` provider 플래그 + `ops:set-oauth`류 시크릿 주입
  - 최초 로그인 시에만 이름/이메일 반환 → 프로필 저장 로직 점검(이미 `/u/bootstrap` 있음)

## 5. 푸시 알림 — 네이티브(APNs/FCM) `[확정 필요]`

> 웹푸시(VAPID)는 유지. 네이티브 앱에는 별도 토큰 채널을 추가한다.

- [ ] `@capacitor/push-notifications` 도입, 권한 요청 UX(기존 `PushPermissionSheet` 재사용)
- [ ] **APNs(iOS)**: Apple Developer 푸시 키(.p8), **FCM(Android)**: Firebase 프로젝트 + `google-services.json`
- [ ] **디바이스 토큰 등록 API** — 기존 `/u/push-subscriptions`(웹푸시) 옆에 네이티브 토큰 저장 추가
      (`push-repo`에 platform 필드: `web` | `ios` | `android`)
- [ ] **발송 확장** — `services/workers/notification-worker`가 web-push 외에 APNs/FCM(또는 SNS Platform
      Application)로도 보내도록 분기. 시크릿: `chme2-<stage>/apns`, `chme2-<stage>/fcm` 셸 신설(infra2)
- [ ] 딥링크 페이로드(알림 탭 → 특정 화면 이동) 설계

## 6. 결제 (해당 시) `[확정 필요]`

- [ ] 판매 품목이 **실물/서비스**면: 기존 PG 흐름 유지 (`PAYMENT_SPEC.md`), 앱에서도 웹 결제 재사용
- [ ] **디지털 재화/구독**이면: 애플/구글 IAP 연동(`@capacitor/…` 또는 RevenueCat), 서버 영수증 검증,
      정산 로직에 수수료 반영 — 별도 스펙 필요(범위 큼)

## 7. 인프라 · 백엔드 변경 요약

- [ ] `infra2/config/stages.ts`: `socialLogin.callbackUrls`(+커스텀 스킴), `cors.allowOrigins`(+capacitor 오리진)
- [ ] (푸시) infra2에 `apns`/`fcm` 시크릿 셸 + `notification-worker` 권한/발송 분기
- [ ] (애플 로그인) Cognito Apple IdP + 시크릿
- [ ] 배포 후 산출물 URL/도메인 확인 (`HostedUiBaseUrl` 등)

## 8. 스토어 배포 준비 (외부 · 유료)

- [ ] **Apple**: Developer Program($99/년), App Store Connect 앱 생성, 심사 메타데이터,
      개인정보 처리방침 URL, 로그인 심사 계정 제공
- [ ] **Google**: Play Console($25 1회), 앱 서명, 데이터 보안 양식
- [ ] 두 스토어 공통: 개인정보처리방침·이용약관, 연령등급, 스크린샷/아이콘
- [ ] 릴리스 파이프라인(수동/자동) 결정 — 초기엔 수동 업로드 권장

---

## 9. 권장 진행 순서 (마일스톤)

1. **M1 — Capacitor 골격 + Android 내부 테스트** (§2, §3): 웹 코드 그대로 Android 앱으로 뜨는지 확인
2. **M2 — 소셜 로그인 네이티브 분기** (§4, 애플 제외): 구글/카카오 딥링크 로그인 동작
3. **M3 — 네이티브 푸시** (§5): APNs/FCM 토큰 등록 + 발송
4. **M4 — iOS 대응** (§4 애플 로그인, §8 애플 준비): 애플 로그인 + App Store 심사
5. **M5 — (해당 시) 결제** (§6)
6. **M6 — 스토어 정식 출시** (§8)

> Android부터(§0-2에서 Android만 택하면 M4 생략) 빠르게 검증 후 iOS를 붙이는 흐름이 리스크가 가장 낮다.

## 10. 열린 결정 (답 주시면 이 문서 확정)

- [ ] **배포 스토어**: iOS+Android / Android만 / 웹만 → §1-1, §4-애플, §8 범위 결정
- [ ] **푸시**: 네이티브 / 웹푸시로 충분 → §5 포함 여부
- [ ] **인앱 결제 품목**: 실물·서비스 / 디지털 재화 → §6 범위
- [ ] **앱 식별자/이름**: `appId`(예: `com.chum7.app`), 스토어 표시명 확정
