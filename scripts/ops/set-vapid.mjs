#!/usr/bin/env node
/**
 * VAPID 키 생성·주입 (Web Push용). 크로스플랫폼.
 *
 *   npm run ops:set-vapid -- --stage dev     # 새 키 생성 후 주입
 *   npm run ops:set-vapid -- --stage prod
 *   npm run ops:set-vapid -- --stage dev --public <pub> --private <priv>  # 기존 키 주입
 *
 * 코드가 읽는 시크릿: chme2-<stage>/vapid = {"publicKey":"...","privateKey":"..."}
 * (notification-worker 발송, user-api GET /public/push/key 공개키 제공)
 * 프론트는 배포 시점에 /public/push/key로 공개키를 가져가므로 별도 프론트 설정 불필요.
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

let publicKey = opt('public');
let privateKey = opt('private');

if (!publicKey || !privateKey) {
  console.log('🔑 새 VAPID 키를 생성합니다…');
  const out = execSync('npx --yes web-push generate-vapid-keys', { encoding: 'utf8' });
  publicKey = (out.match(/Public Key:\s*\n?\s*(\S+)/) ?? [])[1];
  privateKey = (out.match(/Private Key:\s*\n?\s*(\S+)/) ?? [])[1];
  if (!publicKey || !privateKey) {
    console.error('❌ 키 생성 결과 파싱 실패:\n' + out);
    process.exit(1);
  }
}

const secretId = `chme2-${stage}/vapid`;
const tmp = join(root, `.vapid-${stage}.tmp.json`);
writeFileSync(tmp, JSON.stringify({ publicKey, privateKey }));
try {
  // file:// 로 전달 — PowerShell/셸 따옴표 이스케이프 문제 회피
  execSync(
    `aws secretsmanager put-secret-value --secret-id "${secretId}" --secret-string file://${tmp}`,
    { stdio: 'inherit' },
  );
} finally {
  rmSync(tmp, { force: true });
}

console.log(`\n✅ ${secretId} 주입 완료`);
console.log(`   공개키: ${publicKey}`);
console.log(`   (개인키는 시크릿에만 저장됨 — 콘솔·리포에 남기지 마세요)`);
console.log(`\n확인: user-api 배포 후  curl <ApiUrl>/public/push/key  → {"publicKey":"..."}`);
