import { apiClient } from '@/lib/api-client';

/**
 * 소셜 로그인(Google/Kakao) — Cognito Hosted UI 팝업 + PKCE(Authorization Code).
 *
 * 흐름:
 *  1) 오프너(로그인 화면)가 authorize URL을 만들어 PKCE verifier/state를 자신의 sessionStorage에 저장
 *  2) 팝업이 Cognito Hosted UI로 이동 → 소셜 로그인 → /auth/callback 으로 복귀
 *  3) 콜백 페이지(팝업)는 code/state 를 오프너로 postMessage 후 창을 닫음
 *  4) 오프너가 state 검증 → 토큰 교환(/oauth2/token, 퍼블릭 클라이언트+PKCE, 시크릿 없음)
 *
 * 민감한 처리(verifier 보관·토큰 교환)는 전부 오프너에서 수행한다(팝업은 단순 릴레이).
 */

export interface SocialConfig {
  enabled: boolean;
  hostedUiDomain: string; // 예: https://chme2-dev-auth.auth.ap-northeast-2.amazoncognito.com
  clientId: string;
  providers: string[]; // 예: ['google', 'kakao']
  scopes: string[];
}

export interface SocialLoginResult {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

/** provider 키 → Cognito IdP 이름(authorize의 identity_provider 값) */
const IDP_NAME: Record<string, string> = { google: 'Google', kakao: 'Kakao' };

const REDIRECT_PATH = '/auth/callback';
const VERIFIER_KEY = 'oauth_pkce_verifier';
const STATE_KEY = 'oauth_state';

export async function fetchSocialConfig(): Promise<SocialConfig> {
  const { data } = await apiClient.get('/auth/social/config');
  return data.data as SocialConfig;
}

export function redirectUri(): string {
  return `${window.location.origin}${REDIRECT_PATH}`;
}

// --- PKCE 유틸 ---
function base64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLen = 48): string {
  const arr = new Uint8Array(byteLen);
  crypto.getRandomValues(arr);
  return base64url(arr);
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return new Uint8Array(digest);
}

async function buildAuthorizeUrl(cfg: SocialConfig, provider: string): Promise<string> {
  const verifier = randomString(48);
  const challenge = base64url(await sha256(verifier));
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri(),
    scope: cfg.scopes.join(' '),
    identity_provider: IDP_NAME[provider] ?? provider,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${cfg.hostedUiDomain}/oauth2/authorize?${params.toString()}`;
}

interface CallbackMessage {
  type: 'oauth_callback';
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

function waitForCallback(popup: Window): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const expectedState = sessionStorage.getItem(STATE_KEY);
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(timer);
    };

    const onMessage = (e: MessageEvent) => {
      // 같은 오리진(우리 콜백 페이지)에서 온 메시지만 신뢰
      if (e.origin !== window.location.origin) return;
      const d = e.data as CallbackMessage | undefined;
      if (!d || d.type !== 'oauth_callback') return;
      settled = true;
      cleanup();
      if (d.error) return reject(new Error(d.errorDescription || d.error));
      if (expectedState && d.state !== expectedState) {
        return reject(new Error('보안 검증에 실패했습니다(state 불일치). 다시 시도해주세요.'));
      }
      if (!d.code) return reject(new Error('인증 코드를 받지 못했습니다.'));
      resolve(d.code);
    };

    window.addEventListener('message', onMessage);
    // 사용자가 팝업을 직접 닫은 경우 감지
    const timer = window.setInterval(() => {
      if (popup.closed && !settled) {
        cleanup();
        reject(new Error('로그인 창이 닫혔습니다.'));
      }
    }, 500);
  });
}

async function exchangeCode(cfg: SocialConfig, code: string): Promise<SocialLoginResult> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY) || '';
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  const res = await fetch(`${cfg.hostedUiDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  if (!res.ok) {
    throw new Error('소셜 로그인 토큰 교환에 실패했습니다.');
  }
  const json = (await res.json()) as {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
  };
  if (!json.id_token || !json.refresh_token) {
    throw new Error('로그인 응답이 올바르지 않습니다.');
  }
  return {
    idToken: json.id_token,
    accessToken: json.access_token ?? json.id_token,
    refreshToken: json.refresh_token,
  };
}

/** 소셜 로그인 팝업을 열고 토큰을 반환한다. 실패 시 사용자 메시지로 throw. */
export async function openSocialLogin(provider: string): Promise<SocialLoginResult> {
  const cfg = await fetchSocialConfig();
  if (!cfg.enabled) {
    throw new Error('소셜 로그인이 아직 활성화되지 않았습니다.');
  }
  const url = await buildAuthorizeUrl(cfg, provider);

  const w = 480;
  const h = 720;
  const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
  const popup = window.open(
    url,
    'chum7-social-login',
    `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`,
  );
  if (!popup) {
    throw new Error('팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해주세요.');
  }

  const code = await waitForCallback(popup);
  return exchangeCode(cfg, code);
}
