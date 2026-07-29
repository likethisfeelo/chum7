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

// --- 스택 목록 (cdk가 실제 합성하는 이름 — cert 스택 존재 여부까지 자동 반영) ---
const infra2Dir = join(root, 'infra2');
const edgeStack = `chme2-${stage}-edge`;
const allStacks = capture(`npx cdk list --context stage=${stage}`, infra2Dir)
  .stdout.trim()
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);
const backendStacks = allStacks.filter((s) => s !== edgeStack);

// 2) diff — prod는 Stateful 삭제/치환 감지 시 강제 중단
const diffSelector =
  only === 'api'
    ? `chme2-${stage}-workers chme2-${stage}-api chme2-${stage}-observability`
    : only === 'frontend'
      ? edgeStack
      : '--all';
const diff = capture(`npx cdk diff ${diffSelector} --context stage=${stage}`, infra2Dir);
console.log(diff.stdout || '');
if (diff.stderr) console.error(diff.stderr);

// stateful 스택 "섹션만" 추출해 검사 — 타 스택의 [-]를 오탐하지 않도록
// (cdk diff는 "Stack <이름>" 헤딩으로 스택별 블록을 구분한다)
function stackSection(diffText, stackName) {
  const out = [];
  let capturing = false;
  for (const line of diffText.split('\n')) {
    if (/^Stack\s+\S/.test(line)) capturing = line.includes(stackName);
    if (capturing) out.push(line);
  }
  return out.join('\n');
}
const statefulSection = stackSection(`${diff.stdout}\n${diff.stderr}`, `chme2-${stage}-stateful`);
// 위험 = "리소스 레벨" 삭제/치환만. 속성 diff의 배열 원소 삭제(예: OAuth 스코프 목록에서
// "phone" 제거 → `[-]   "phone",`)는 위험이 아니다. 과거엔 bare `[-]` 를 잡아 이런
// 무해한 속성 변경까지 오탐했다. 리소스 삭제는 `[-] AWS::...` 형태(타입이 뒤따름)로만,
// 치환은 cdk가 붙이는 명시 문구로만 판정한다.
const statefulDanger =
  /^\s*\[-\]\s+AWS::/m.test(statefulSection) || // 리소스 삭제
  /(may be replaced|requires replacement|will be destroyed)/i.test(statefulSection); // 치환
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

// 3) prod 확인 입력
if (stage === 'prod') {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("\nPROD 배포를 진행하려면 'DEPLOY'를 입력하세요: ");
  rl.close();
  if (answer.trim() !== 'DEPLOY') {
    console.log('취소되었습니다.');
    process.exit(1);
  }
}

mkdirSync(join(infra2Dir, 'cdk.out'), { recursive: true });
const outputsFile = join(infra2Dir, 'cdk.out', `outputs-${stage}.json`);

function deployStacks(list) {
  if (!list.length) return;
  run(
    `npx cdk deploy ${list.join(' ')} --context stage=${stage} --require-approval never --outputs-file "${outputsFile}"`,
    infra2Dir,
  );
}
function genEnv() {
  if (existsSync(outputsFile)) run(`node scripts/gen-env.mjs --stage ${stage} --outputs "${outputsFile}"`);
}
function buildFrontend() {
  const mode = stage === 'prod' ? 'production' : 'development';
  for (const dir of ['frontend', 'admin-frontend']) {
    const path = join(root, dir);
    if (existsSync(join(path, 'package.json'))) run(`npm run build -- --mode ${mode}`, path);
  }
}

// 4) 순서가 핵심: 백엔드 배포 → env 생성 → 프론트 빌드 → edge 배포.
//    (구버전은 빈 .env로 프론트를 먼저 빌드해 API/Cognito 값이 누락됐음 — CORS·로그인 실패 원인)
if (only === 'api') {
  deployStacks([`chme2-${stage}-workers`, `chme2-${stage}-api`, `chme2-${stage}-observability`]);
  genEnv();
} else if (only === 'frontend') {
  if (!existsSync(outputsFile)) deployStacks(backendStacks); // env 소스가 없으면 백엔드부터
  genEnv();
  buildFrontend();
  deployStacks([edgeStack]);
} else {
  deployStacks(backendStacks); // API·Cognito·업로드 버킷 Outputs 확보
  genEnv(); // 확정된 값으로 .env 생성 (빌드 전!)
  buildFrontend(); // 이제 올바른 API/Cognito가 번들에 박힌다
  deployStacks(allStacks); // edge가 방금 빌드를 업로드 (백엔드는 no-op)
  genEnv(); // 최종 Outputs(AppUrl 등)로 .env 갱신 — 다음 빌드 대비
}

// 5) 주요 Outputs 출력
if (existsSync(outputsFile)) {
  const outputs = JSON.parse(readFileSync(outputsFile, 'utf8'));
  console.log('\n=== 주요 Outputs ===');
  for (const [stack, values] of Object.entries(outputs)) {
    for (const [key, value] of Object.entries(values)) {
      console.log(`${stack}.${key} = ${value}`);
    }
  }
}

console.log(`\n✅ 완료 (${Math.round((Date.now() - startedAt) / 1000)}s)`);
