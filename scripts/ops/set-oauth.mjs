#!/usr/bin/env node
/**
 * 소셜 로그인 OAuth 클라이언트 시크릿 주입 (Google / Kakao). 크로스플랫폼.
 *
 *   npm run ops:set-oauth -- --stage dev --provider google --client-id <id> --client-secret <secret>
 *   npm run ops:set-oauth -- --stage prod --provider kakao  --client-id <id> --client-secret <secret>
 *
 * 코드가 읽는 시크릿:
 *   chme2-<stage>/oauth-google = {"clientId":"...","clientSecret":"..."}
 *   chme2-<stage>/oauth-kakao  = {"clientId":"...","clientSecret":"..."}
 *
 * 주입 후 해당 IdP를 켜려면 infra2/config/stages.ts 의 socialLogin.{google|kakao} 를 true 로 바꾼 뒤
 * 스택을 재배포한다(IdP는 배포 시 동적 참조로 이 시크릿 값을 읽는다).
 *
 * 준비물(각 콘솔에서 무료로 발급):
 *  - Google  : Google Cloud Console → OAuth 클라이언트. 승인된 리디렉션 URI =
 *              <HostedUiBaseUrl>/oauth2/idpresponse
 *  - Kakao   : Kakao Developers → 앱 + "OpenID Connect 활성화". Redirect URI =
 *              <HostedUiBaseUrl>/oauth2/idpresponse (client-secret = 보안 → 카카오 로그인 Client Secret)
 *  (HostedUiBaseUrl 은 스택 배포 출력 HostedUiBaseUrl 값)
 */
import { execSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const stage = opt('stage', 'dev');
const provider = opt('provider');
const clientId = opt('client-id');
const clientSecret = opt('client-secret');

if (!['dev', 'prod'].includes(stage)) {
  console.error(`❌ 알 수 없는 stage: ${stage} (dev | prod)`);
  process.exit(1);
}
if (!['google', 'kakao'].includes(provider)) {
  console.error(`❌ --provider 는 google | kakao 여야 합니다 (받은 값: ${provider})`);
  process.exit(1);
}
if (!clientId || !clientSecret) {
  console.error('❌ --client-id 와 --client-secret 을 모두 지정해주세요');
  process.exit(1);
}

const secretId = `chme2-${stage}/oauth-${provider}`;
const tmp = join(root, `.oauth-${stage}-${provider}.tmp.json`);
writeFileSync(tmp, JSON.stringify({ clientId, clientSecret }));
try {
  // file:// 로 전달 — 셸 따옴표 이스케이프 문제 회피
  execSync(
    `aws secretsmanager put-secret-value --secret-id "${secretId}" --secret-string file://${tmp}`,
    { stdio: 'inherit' },
  );
} finally {
  rmSync(tmp, { force: true });
}

console.log(`\n✅ ${secretId} 주입 완료`);
console.log(`   clientId: ${clientId}`);
console.log('   (clientSecret 은 시크릿에만 저장됨 — 콘솔·리포에 남기지 마세요)');
console.log(
  `\n다음 단계: infra2/config/stages.ts 의 socialLogin.${provider} = true 로 변경 후 스택 재배포`,
);
