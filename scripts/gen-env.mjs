#!/usr/bin/env node
/**
 * CDK Outputs → 프론트 .env 자동 생성 (REDESIGN_PLAN §4-⑤).
 * Cognito ID·API URL을 손으로 복사하는 절차를 없앤다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const stage = args[args.indexOf('--stage') + 1];
const outputsPath = args[args.indexOf('--outputs') + 1];
if (!stage || !outputsPath) {
  console.error('usage: gen-env.mjs --stage <dev|prod> --outputs <outputs.json>');
  process.exit(1);
}

const outputs = JSON.parse(readFileSync(outputsPath, 'utf8'));
const flat = {};
for (const values of Object.values(outputs)) Object.assign(flat, values);

// 커스텀 도메인 배포면 api.chum7.com 을 우선 사용 (없으면 execute-api 기본 URL)
const apiUrl = flat.ApiCustomDomain || flat.ApiUrl;
const lines = [
  `# 자동 생성됨 (scripts/gen-env.mjs) — 손으로 수정하지 말 것`,
  `VITE_APP_STAGE=${stage}`,
  apiUrl && `VITE_API_URL=${apiUrl}`,
  flat.UserPoolId && `VITE_COGNITO_USER_POOL_ID=${flat.UserPoolId}`,
  flat.UserPoolClientId && `VITE_COGNITO_CLIENT_ID=${flat.UserPoolClientId}`,
  flat.AppUrl && `VITE_CLOUDFRONT_URL=${flat.AppUrl}`,
  flat.UploadsBucketName && `VITE_S3_UPLOADS_BUCKET=${flat.UploadsBucketName}`,
].filter(Boolean);

const mode = stage === 'prod' ? 'production' : 'development';
for (const dir of ['frontend', 'admin-frontend']) {
  const target = join(root, dir, `.env.${mode}`);
  writeFileSync(target, `${lines.join('\n')}\n`);
  console.log(`✔ ${target}`);
}
