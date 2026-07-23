import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

/**
 * 익명 ID 솔트 로더 — env `ANON_ID_SALT` 우선, 없으면 Secrets Manager
 * (`ANON_ID_SALT_SECRET_NAME`)에서 1회 조회 후 콜드스타트 캐시.
 * 시크릿 값은 평문 문자열 또는 `{"salt":"..."}` JSON 둘 다 허용.
 * 어느 소스에서도 못 찾으면 `ANON_SALT_NOT_CONFIGURED`를 throw한다(레거시 계약 유지).
 *
 * 도메인(anonymous-id.ts)은 순수 함수로 유지하기 위해 솔트 로딩은 이 모듈이 전담한다.
 */
let cached: Promise<string> | undefined;

export function loadAnonSalt(): Promise<string> {
  if (!cached) {
    cached = (async () => {
      const direct = process.env.ANON_ID_SALT;
      if (direct) return direct;

      const secretName = process.env.ANON_ID_SALT_SECRET_NAME;
      if (secretName) {
        const client = new SecretsManagerClient({});
        const res = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
        const raw = res.SecretString ?? '';
        try {
          const parsed = JSON.parse(raw) as { salt?: string };
          if (parsed && typeof parsed.salt === 'string' && parsed.salt) return parsed.salt;
        } catch {
          // 평문 시크릿으로 취급
        }
        if (raw) return raw;
      }
      throw new Error('ANON_SALT_NOT_CONFIGURED');
    })().catch((e) => {
      cached = undefined; // 실패는 캐시하지 않음 — 다음 호출에서 재시도
      throw e;
    });
  }
  return cached;
}
