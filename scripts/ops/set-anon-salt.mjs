#!/usr/bin/env node
/**
 * 익명 활동명 솔트 생성·주입 (social-api 익명 ID용). 크로스플랫폼.
 *
 *   npm run ops:set-anon-salt -- --stage dev      # 새 랜덤 솔트 생성 후 주입
 *   npm run ops:set-anon-salt -- --stage prod
 *   npm run ops:set-anon-salt -- --stage dev --salt <값>   # 기존 솔트 주입
 *
 * 코드가 읽는 시크릿: chme2-<stage>/anon-id-salt = {"salt":"..."} (평문도 허용)
 * social-api가 콜드스타트 1회 로드·캐시하여 보드·인증 댓글 익명 ID(동물-번호)를 생성한다.
 *
 * ⚠️ 회전 금지: 솔트를 바꾸면 과거 모든 활동명이 달라진다. 한 번 정하면 고정.
 *    이미 값이 있으면 --force 없이는 덮어쓰지 않는다.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const stage = opt('stage', 'dev');
if (!['dev', 'prod'].includes(stage)) {
  console.error(`❌ 알 수 없는 stage: ${stage} (dev | prod)`);
  process.exit(1);
}

const secretId = `chme2-${stage}/anon-id-salt`;
const region = opt('region', 'ap-northeast-2');

// 회전 방지 — 이미 실값이 있으면 --force 없이는 중단
try {
  const cur = execSync(
    `aws secretsmanager get-secret-value --secret-id "${secretId}" --region ${region} --query SecretString --output text`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
  if (cur && cur !== 'None' && !flag('force')) {
    console.error(
      `❌ ${secretId} 에 이미 값이 있습니다. 솔트 회전은 과거 활동명을 전부 바꿉니다.\n` +
        `   정말 덮어쓰려면 --force 를 붙이세요(권장하지 않음).`,
    );
    process.exit(1);
  }
} catch {
  // 값 없음/시크릿 셸만 존재 — 정상 진행
}

const salt = opt('salt') || randomBytes(32).toString('hex');
const tmp = join(root, `.anon-salt-${stage}.tmp.json`);
writeFileSync(tmp, JSON.stringify({ salt }));
try {
  execSync(
    `aws secretsmanager put-secret-value --secret-id "${secretId}" --secret-string file://${tmp} --region ${region}`,
    { stdio: 'inherit' },
  );
} finally {
  rmSync(tmp, { force: true });
}

console.log(`\n✅ ${secretId} 주입 완료 (길이 ${salt.length})`);
console.log('   솔트 값은 시크릿에만 저장됨 — 콘솔·리포에 남기지 마세요.');
console.log('   ⚠️ 이 값은 고정입니다. 다시 바꾸지 마세요(과거 활동명 전부 변경됨).');
