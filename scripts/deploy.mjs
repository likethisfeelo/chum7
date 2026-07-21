#!/usr/bin/env node
/**
 * 원커맨드 배포 (REDESIGN_PLAN §4) — 크로스플랫폼(Node) 단일 경로.
 *
 *   npm run deploy -- --stage dev                 # 검증 → 빌드 → diff → 배포 → env 생성
 *   npm run deploy -- --stage dev --only api      # API/워커 스택만
 *   npm run deploy -- --stage dev --only frontend # 프론트 빌드+edge 스택만
 *   npm run deploy -- --stage prod                # 'DEPLOY' 확인 입력 필요
 *   npm run deploy -- --stage dev --diff          # 배포 없이 diff만
 *   플래그: --skip-tests, --allow-stateful-replace(prod 가드 해제)
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function flag(name) {
  return args.includes(`--${name}`);
}
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
}

const stage = option('stage', 'dev');
const only = option('only', 'all'); // all | api | frontend
if (!['dev', 'prod'].includes(stage)) {
  console.error(`❌ 알 수 없는 stage: ${stage} (dev | prod)`);
  process.exit(1);
}

function run(command, cwd = root, env = {}) {
  console.log(`\n▶ ${command}`);
  execSync(command, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
}
function capture(command, cwd = root) {
  return spawnSync(command, { cwd, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const startedAt = Date.now();
console.log(`\n=== CHME 배포: stage=${stage} only=${only} ===`);

// 1) 검증 — 실패 시 배포 진입 차단
if (!flag('skip-tests')) {
  run('npm run typecheck');
  run('npx jest --silent --testPathPattern "(packages|services|infra2)/"');
} else {
  console.log('⚠ --skip-tests: 검증 생략');
}

// 2) 프론트 빌드 (frontend 대상일 때)
if (only === 'all' || only === 'frontend') {
  const mode = stage === 'prod' ? 'production' : 'development';
  for (const dir of ['frontend', 'admin-frontend']) {
    const path = join(root, dir);
    if (existsSync(join(path, 'package.json'))) {
      run(`npm run build -- --mode ${mode}`, path);
    }
  }
}

// 3) diff — prod는 Stateful 삭제/치환 감지 시 강제 중단
const stackSelector =
  only === 'api'
    ? `chme2-${stage}-workers chme2-${stage}-api chme2-${stage}-observability`
    : only === 'frontend'
      ? `chme2-${stage}-edge`
      : '--all';
const diffCmd = `npx cdk diff ${stackSelector} --context stage=${stage}`;
const diff = capture(diffCmd, join(root, 'infra2'));
console.log(diff.stdout || '');
if (diff.stderr) console.error(diff.stderr);

const statefulDanger = /chme2-.*-stateful[\s\S]*?(\[-\]|\[~\][^\n]*replace)/i.test(
  `${diff.stdout}\n${diff.stderr}`,
);
if (stage === 'prod' && statefulDanger && !flag('allow-stateful-replace')) {
  console.error(
    '\n❌ prod Stateful 리소스 삭제/치환이 감지되었습니다. 의도된 변경이면 --allow-stateful-replace로 재실행하세요.',
  );
  process.exit(1);
}

if (flag('diff')) {
  console.log('\n(diff 모드 — 배포 생략)');
  process.exit(0);
}

// 4) prod 확인 입력
if (stage === 'prod') {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("\nPROD 배포를 진행하려면 'DEPLOY'를 입력하세요: ");
  rl.close();
  if (answer.trim() !== 'DEPLOY') {
    console.log('취소되었습니다.');
    process.exit(1);
  }
}

// 5) 배포 (+ Outputs 파일)
mkdirSync(join(root, 'infra2', 'cdk.out'), { recursive: true });
const outputsFile = join(root, 'infra2', 'cdk.out', `outputs-${stage}.json`);
run(
  `npx cdk deploy ${stackSelector} --context stage=${stage} --require-approval never --outputs-file "${outputsFile}"`,
  join(root, 'infra2'),
);

// 6) CfnOutputs → 프론트 .env 자동 생성
if (existsSync(outputsFile)) {
  run(`node scripts/gen-env.mjs --stage ${stage} --outputs "${outputsFile}"`);
  const outputs = JSON.parse(readFileSync(outputsFile, 'utf8'));
  console.log('\n=== 주요 Outputs ===');
  for (const [stack, values] of Object.entries(outputs)) {
    for (const [key, value] of Object.entries(values)) {
      console.log(`${stack}.${key} = ${value}`);
    }
  }
}

console.log(`\n✅ 완료 (${Math.round((Date.now() - startedAt) / 1000)}s)`);
