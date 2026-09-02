#!/usr/bin/env node
/**
 * 라이브 음성방 TURN 자격증명 주입 (Cloudflare Realtime TURN). 크로스플랫폼.
 *
 *   npm run ops:set-turn -- --stage dev --api-token <API_TOKEN>
 *   npm run ops:set-turn -- --stage prod --api-token <API_TOKEN> --token-id <TOKEN_ID>
 *
 * 코드가 읽는 시크릿: chme2-<stage>/turn = {"tokenId":"...","apiToken":"..."}
 * challenge-api가 방 입장 시 이 값으로 단기 TURN 자격증명을 발급해 클라이언트에 내려준다
 * (프론트 번들에 비밀을 넣지 않기 위함 — 쿼터 도용 방지).
 *
 * ⚠️ API 토큰은 셸 히스토리에 남습니다. 주입 후 히스토리 정리를 권장합니다.
 *    미주입 상태여도 서비스는 정상 동작합니다(STUN만 사용 — 대부분의 연결은 성공).
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
if (!['dev', 'prod'].includes(stage)) {
  console.error(`❌ 알 수 없는 stage: ${stage} (dev | prod)`);
  process.exit(1);
}

// Cloudflare 대시보드 Media → Realtime → TURN Server 에서 발급한 값
const DEFAULT_TOKEN_ID = '02848dbef9adebdb0d358633432e4766';
const tokenId = opt('token-id', DEFAULT_TOKEN_ID);
const apiToken = opt('api-token') || process.env.CF_TURN_API_TOKEN;

if (!apiToken) {
  console.error(
    '❌ API 토큰이 필요합니다.\n' +
      '   npm run ops:set-turn -- --stage dev --api-token <API_TOKEN>\n' +
      '   또는 환경변수 CF_TURN_API_TOKEN 설정 후 재실행',
  );
  process.exit(1);
}

const secretId = `chme2-${stage}/turn`;
const region = opt('region', 'ap-northeast-2');
const tmp = join(root, `.turn-${stage}.tmp.json`);
writeFileSync(tmp, JSON.stringify({ tokenId, apiToken }));
try {
  execSync(
    `aws secretsmanager put-secret-value --secret-id "${secretId}" --secret-string file://${tmp} --region ${region}`,
    { stdio: 'inherit' },
  );
} finally {
  rmSync(tmp, { force: true });
}

console.log(`\n✅ ${secretId} 주입 완료 (tokenId ${tokenId.slice(0, 8)}…)`);
console.log('   challenge-api 재배포 후 방 입장 응답에 iceServers가 실려 내려갑니다.');
console.log('   확인: 방 입장 → chrome://webrtc-internals 에서 candidate type "relay" 존재 여부');
