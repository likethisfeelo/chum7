/**
 * TURN 자격증명 발급 — Cloudflare Realtime TURN.
 * 정적 아이디/비밀번호가 없고 API로 단기 자격증명을 발급받는 구조라, 프론트 번들에
 * 비밀을 박지 않고 서버가 방 입장 시점에 만들어 내려준다(쿼터 도용 방지).
 *
 * 설정 (`npm run ops:set-turn`으로 시크릿 1회 주입 — 배포 시 env 지정 불필요):
 *  - CF_TURN_SECRET_NAME     시크릿 이름, 값 {"tokenId":"...","apiToken":"..."}
 *  - CF_TURN_TOKEN_ID / CF_TURN_API_TOKEN  env 직접 지정 시 시크릿보다 우선(로컬 테스트용)
 * 미설정이면 null을 반환하고 클라이언트는 STUN만 사용한다(연결 대부분은 그래도 성공).
 */
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const CREDENTIAL_TTL_SECONDS = 6 * 60 * 60; // 방 최대 수명(12h)보다 짧게 — 유출 시 노출 창 축소
const REFRESH_MARGIN_MS = 30 * 60 * 1000; // 만료 30분 전 갱신
const FETCH_TIMEOUT_MS = 3000;

export interface IceServer {
  urls: string[] | string;
  username?: string;
  credential?: string;
}

interface TurnConfig {
  tokenId: string;
  apiToken: string;
}

let configCache: Promise<TurnConfig> | undefined;

function loadConfig(): Promise<TurnConfig> {
  if (!configCache) {
    configCache = (async () => {
      const envTokenId = process.env.CF_TURN_TOKEN_ID;
      const envApiToken = process.env.CF_TURN_API_TOKEN;
      if (envTokenId && envApiToken) return { tokenId: envTokenId, apiToken: envApiToken };

      const secretName = process.env.CF_TURN_SECRET_NAME;
      if (secretName) {
        const client = new SecretsManagerClient({});
        const res = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
        try {
          const parsed = JSON.parse(res.SecretString ?? '') as Partial<TurnConfig>;
          const tokenId = envTokenId || parsed.tokenId;
          const apiToken = envApiToken || parsed.apiToken;
          if (tokenId && apiToken) return { tokenId, apiToken };
        } catch {
          // 미주입(빈 시크릿) 또는 형식 불일치 — 미설정으로 취급
        }
      }
      throw new Error('TURN_NOT_CONFIGURED');
    })().catch((err) => {
      configCache = undefined; // 실패는 캐시하지 않음
      throw err;
    });
  }
  return configCache;
}

// 발급 결과 캐시 — 요청마다 Cloudflare를 호출하지 않도록 웜 컨테이너에서 재사용
let credentialCache: { servers: IceServer[]; expiresAt: number } | null = null;

/**
 * 단기 TURN 자격증명 발급. 미설정·실패 시 null (호출부는 STUN만으로 진행).
 * 실패를 던지지 않는 이유: TURN은 소수 연결을 구제하는 안전망이라,
 * 발급이 안 된다고 방 입장 자체를 막으면 손해가 더 크다.
 */
export async function getTurnIceServers(): Promise<IceServer[] | null> {
  if (credentialCache && credentialCache.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return credentialCache.servers;
  }

  try {
    const { tokenId, apiToken } = await loadConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let body: any;
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(tokenId)}/credentials/generate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        console.error('turn credential generate failed', res.status);
        return null;
      }
      body = await res.json();
    } finally {
      clearTimeout(timer);
    }

    // 응답 형태: { iceServers: { urls: [...], username, credential } } (단일 객체 또는 배열)
    const raw = body?.iceServers;
    const list: IceServer[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const servers = list.filter((s) => s && (typeof s.urls === 'string' || Array.isArray(s.urls)));
    if (servers.length === 0) return null;

    credentialCache = { servers, expiresAt: Date.now() + CREDENTIAL_TTL_SECONDS * 1000 };
    return servers;
  } catch (err: any) {
    if (err?.message !== 'TURN_NOT_CONFIGURED') {
      console.error('turn credential error (non-fatal):', err?.message ?? err);
    }
    return null;
  }
}
