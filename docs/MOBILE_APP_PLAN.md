# 웹앱 + 네이티브 앱 동시 지원 계획 (Capacitor)

> 목표: **하나의 코드베이스(현 `frontend/` React+Vite PWA)** 로 웹앱과 iOS/Android 네이티브 앱을
> 동시에 제공한다. 네이티브는 **Capacitor**로 기존 웹 빌드를 감싸 스토어에 올린다 (UI 재작성 없음).

## 0. 전제 · 결정값 (확정)

아래는 **확정된 결정값**이다 (2026-07-29). 바꾸려면 이 표만 고치고 영향 섹션을 참고한다.

| # | 항목 | 결정값 | 비고 |
|---|------|--------|------|
| 1 | 네이티브 방식 | ✅ **Capacitor** (웹 코드 재사용) | React Native면 UI 전면 재작성 → 이 문서 폐기 수준 |
| 2 | 배포 대상 | ✅ **iOS 앱 + Android 앱 + 웹서비스 유지** (셋 다) | 웹은 지금처럼 계속 서비스, 앱은 추가로 스토어 배포 |
| 3 | 푸시 | ✅ **네이티브 푸시 우선** + 앱 미설치 유저는 **일부 알림만 이메일** | 앱 설치 유저 → 앱 푸시만(이메일 중복 발송 금지). §5 |
| 4 | 인앱 결제 | **실물·서비스만(외부 PG) 가정** `[확정 필요]` | 디지털 재화 판매면 애플/구글 IAP 의무(수수료 15~30%) |
| 5 | 오프라인 지원 | ✅ **미지원 (온라인 전용)** | 로컬 캐시/동기화 로직 불필요 |
| 6 | 앱 이름 / 식별자 | 이름 ✅ **`chum7`** / `appId` **미정** `[확정 필요]` | 스토어 표시명은 chum7, 번들ID(`com.___.chum7`)는 조회 후 확정 |

### 현재 상태 (재확인)
- `frontend/`는 이미 **PWA** (Vite + `vite-plugin-pwa`, `sw.js`/manifest 존재) → **웹앱은 이미 됨**.
- 인증: **AWS Cognito** (이메일/비밀번호 + 방금 추가한 **Google/Kakao 소셜 로그인**, Hosted UI 팝업).
- 푸시: **Web Push(VAPID)** — `services/workers/notification-worker` 발송, `chme2-<stage>/vapid` 시크릿.
- 결제: `PAYMENT_SPEC.md` (PG·정산·배송) — `commerce-api`.

---

## 0.5 데이터는 웹·앱 공용 백엔드로 자동 공유됨 (핵심)

> "네이티브 앱 데이터와 웹앱을 같이 진행하는 서비스"는 **새로 만드는 게 아니라 이미 그렇게 되어 있다.**
> 웹·앱을 위해 DB나 계정을 따로 나눌 필요가 전혀 없다.

- 데이터는 **앱/기기 안이 아니라 서버(백엔드)에 저장**된다. 앱·웹은 그 데이터를 보여주는 창일 뿐이다.

```
        [웹앱]  ──┐
                  ├──> 같은 백엔드 API ──> 같은 DB (DynamoDB)
   [iOS/안드 앱] ──┘         + 같은 Cognito (계정/로그인)
```

- Capacitor 네이티브 앱은 **현 웹 코드를 그대로 감싼 것**이라 애초에 **같은 API·같은 Cognito**를 호출한다.
- 따라서 **같은 계정으로 로그인하면 웹·앱·기기가 달라도 같은 데이터**를 본다 (별도 동기화 코드 불필요).

| 상황 | 결과 |
|------|------|
| 폰 앱에서 챌린지 인증 → 웹 접속 | 웹에도 바로 보임 |
| 웹에서 프로필 수정 → 앱 열기 | 앱에도 바로 반영 |
| 앱 로그인 계정 = 웹 로그인 계정 | Cognito가 관리 → 완전히 동일 |

- **전제**: "온라인 상태로 서버에 붙어 쓰는" 방식일 때 자동으로 공유된다.
- **오프라인 지원은 미지원으로 확정** → 로컬 캐시/동기화 로직을 만들지 않는다. 앱은 온라인 전용으로 동작하며,
  네트워크가 없으면 로딩/에러 상태만 보여주면 된다 (별도 동기화 설계 불필요).

> 결론: 이 문서의 대부분 작업은 "데이터 공유"를 위한 게 아니라, **로그인 팝업·푸시가 앱 환경(WebView)에서
> 동작하도록 맞추는** 작업이다.

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
  - `webDir: 'dist'`, `appName: 'chum7'` (확정), `appId: '<확정 필요 — 예: com.chum7.app>'`
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

## 5. 푸시 알림 — 네이티브 우선 + 이메일 폴백 ✅

> **정책 (확정)**: 알림은 **채널을 유저별로 하나만** 골라 보낸다 (중복 발송 금지).
> - **앱 설치 유저** → **앱 푸시(APNs/FCM)만** 보낸다. (웹푸시·이메일 발송 안 함)
> - **앱 미설치(웹 전용) 유저** → **일부 중요 알림만 이메일**로 보낸다.
> - 기존 웹푸시(VAPID)는 앱 푸시로 대체되므로 신규 유저에게 강하게 유도하지 않는다(코드는 당분간 유지).

### 채널 선택 로직 (notification-worker)
```
유저에게 활성 앱 토큰(ios/android)이 있는가?
  ├─ 예  → 앱 푸시만 발송                (이메일·웹푸시 스킵)
  └─ 아니오 → 이 알림이 "이메일 대상"인가?
             ├─ 예  → 이메일 발송         (SES)
             └─ 아니오 → 발송 안 함        (또는 앱 설치 유도만)
```
- "이메일 대상 알림"의 **화이트리스트**를 정의한다 `[확정 필요: 어떤 알림을 이메일로 보낼지]`
  (예: 챌린지 모집 시작, 정산/결제 완료 등 중요 이벤트만. 채팅·좋아요 등 잦은 알림은 제외)

### 작업
- [ ] `@capacitor/push-notifications` 도입, 권한 요청 UX(기존 `PushPermissionSheet` 재사용)
- [ ] **APNs(iOS)**: Apple Developer 푸시 키(.p8), **FCM(Android)**: Firebase 프로젝트 + `google-services.json`
- [ ] **디바이스 토큰 등록 API** — 기존 `/u/push-subscriptions`(웹푸시) 옆에 네이티브 토큰 저장 추가
      (`push-repo`에 `platform: web | ios | android`, 마지막 접속/활성 여부 기록)
- [ ] **앱 설치 여부 판정** — 유저에 유효한 `ios/android` 토큰이 하나라도 있으면 "앱 유저"로 간주
- [ ] **발송 분기** — `services/workers/notification-worker`
  - 앱 유저: APNs/FCM(또는 SNS Platform Application)로 발송
  - 비앱 유저 + 이메일 대상: **SES로 이메일 발송** (템플릿 필요)
  - 시크릿: `chme2-<stage>/apns`, `chme2-<stage>/fcm` 셸 신설(infra2)
- [ ] **SES 세팅** — 발신 도메인/이메일 검증, 이메일 템플릿(중요 알림용), infra2에 권한 추가
- [ ] 딥링크 페이로드(알림 탭 → 특정 화면 이동) 설계

## 6. 결제 (해당 시) `[확정 필요]`

- [ ] 판매 품목이 **실물/서비스**면: 기존 PG 흐름 유지 (`PAYMENT_SPEC.md`), 앱에서도 웹 결제 재사용
- [ ] **디지털 재화/구독**이면: 애플/구글 IAP 연동(`@capacitor/…` 또는 RevenueCat), 서버 영수증 검증,
      정산 로직에 수수료 반영 — 별도 스펙 필요(범위 큼)

## 7. 인프라 · 백엔드 변경 요약

- [ ] `infra2/config/stages.ts`: `socialLogin.callbackUrls`(+커스텀 스킴), `cors.allowOrigins`(+capacitor 오리진)
- [ ] (푸시) infra2에 `apns`/`fcm` 시크릿 셸 + `notification-worker` 권한/발송 분기
- [ ] (이메일) **SES** 발신 도메인 검증 + `notification-worker`에 SES 발송 권한/템플릿
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
3. **M3 — 푸시/알림** (§5): APNs/FCM 토큰 등록 + 앱 푸시 발송, 웹 전용 유저 이메일(SES) 폴백
4. **M4 — iOS 대응** (§4 애플 로그인, §8 애플 준비): 애플 로그인 + App Store 심사
5. **M5 — (해당 시) 결제** (§6)
6. **M6 — 스토어 정식 출시** (§8, iOS+Android)

> iOS·Android 둘 다 확정이므로 M4는 필수. **Android(M1~M3)를 먼저 완성해 빠르게 검증**한 뒤
> iOS(M4, 애플 로그인·유료 계정 준비 포함)를 붙이는 순서가 리스크가 가장 낮다. 웹은 전 과정 내내 그대로 유지된다.

## 10. 결정 현황

**확정됨 ✅**
- 배포 대상: **iOS 앱 + Android 앱 + 웹서비스 유지** (셋 다)
- 푸시: **앱 유저 → 앱 푸시만 / 웹 전용 유저 → 일부 알림만 이메일**
- 오프라인: **미지원(온라인 전용)**
- 앱 이름: **`chum7`**

**아직 미정 `[확정 필요]`**
- [ ] **앱 식별자(`appId` / 번들ID)**: 예 `com.chum7.app` — 조회 후 확정 (스토어 등록 전까지만 정하면 됨)
- [ ] **인앱 결제 품목**: 실물·서비스(외부 PG) / 디지털 재화(IAP 의무) → §6 범위
- [ ] **이메일 발송 대상 알림 목록**: 어떤 알림을 웹 전용 유저에게 이메일로 보낼지 화이트리스트 → §5
