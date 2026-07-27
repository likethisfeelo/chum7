#!/usr/bin/env node
/**
 * 챌린지 관련 데이터 리셋 — DynamoDB 다중 테이블(항목 삭제, 스키마/GSI/권한은 유지) + S3 인증 미디어.
 *
 * ⚠️ 되돌릴 수 없습니다. 기본은 dry-run(카운트만). 실제 삭제는 --apply, prod는 --yes-prod 도 필요.
 * 저장소의 다른 ops 스크립트와 동일하게 로컬 AWS 자격(활성 프로필/역할)으로 실행합니다.
 *
 * 실행 예 (prod 프로필 활성 상태에서):
 *   node scripts/reset-prod-challenges.mjs --stage prod                     # dry-run
 *   node scripts/reset-prod-challenges.mjs --stage prod --apply --yes-prod  # 실제 삭제
 *   옵션: --skip-s3         S3 인증 미디어 삭제 생략
 *         --wipe-plaza      social 의 마당(POST#)·태그(TAG#)·추천(REC#)까지 삭제(기본 보존)
 *         --region <r>      기본 ap-northeast-2 (또는 AWS_REGION)
 *
 * 범위(기본):
 *   challenges   전체 비움 (챌린지·참여·퀘스트·인증·제안·관심)
 *   cheer        전체 비움 (응원)
 *   gamification 전체 비움 (레벨·경험치·진행)
 *   chat         전체 비움 (채팅 연결·메시지)
 *   social       챌린지 연동만: pk ∈ {BOARD#, BULL#, VER#}. 마당(POST#)·TAG#·REC# 보존
 *   S3 uploads   challenges 인증 항목이 참조하는 미디어 키만 삭제
 *   commerce     손대지 않음 (결제 기록 보호)
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  S3Client,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const stage = opt('stage');
const apply = has('apply');
const yesProd = has('yes-prod');
const skipS3 = has('skip-s3');
const wipePlaza = has('wipe-plaza');
const region = opt('region', process.env.AWS_REGION || 'ap-northeast-2');

if (!stage || !['dev', 'prod'].includes(stage)) {
  console.error('❌ --stage <dev|prod> 필수');
  process.exit(1);
}
if (apply && stage === 'prod' && !yesProd) {
  console.error('❌ prod 실제 삭제에는 --yes-prod 도 필요합니다. (먼저 dry-run으로 카운트 확인하세요)');
  process.exit(1);
}

const prefix = `chme2-${stage}`;
const TABLES = {
  challenges: `${prefix}-challenges`,
  cheer: `${prefix}-cheer`,
  gamification: `${prefix}-gamification`,
  chat: `${prefix}-chat`,
  social: `${prefix}-social`,
};
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET; // 미지정 시 S3 단계는 건너뜀

// social 챌린지 연동 파티션 프리픽스 (마당 POST#, 태그 TAG#, 추천 REC# 는 기본 보존)
const SOCIAL_CHALLENGE_PREFIXES = ['BOARD#', 'BULL#', 'VER#'];
const MEDIA_FIELDS = [
  'imageUrl', 'videoUrl', 'thumbnailUrl', 'mediaUrl',
  'imageKey', 'videoKey', 'videoObjectKey',
];
const MEDIA_ARRAY_FIELDS = ['imageKeys', 'mediaKeys'];

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const s3 = new S3Client({ region });

console.log(`\n=== 챌린지 리셋: stage=${stage} mode=${apply ? 'APPLY(삭제)' : 'DRY-RUN(카운트만)'} region=${region} ===`);
console.log(`social 마당/태그/추천: ${wipePlaza ? '삭제' : '보존'} · S3 인증미디어: ${skipS3 ? '생략' : (UPLOADS_BUCKET ? '삭제대상' : 'UPLOADS_BUCKET 미지정→생략')}\n`);

/** 테이블 전체 스캔(키만). filter(item)=true 인 것만 반환. mediaSink 주면 미디어 키 수집. */
async function scanKeys(table, filter, mediaSink) {
  const keys = [];
  let ExclusiveStartKey;
  do {
    const res = await doc.send(new ScanCommand({
      TableName: table,
      ProjectionExpression: mediaSink
        ? `pk, sk, ${MEDIA_FIELDS.join(', ')}, ${MEDIA_ARRAY_FIELDS.join(', ')}`
        : 'pk, sk',
      ExclusiveStartKey,
    }));
    for (const item of res.Items ?? []) {
      if (!filter || filter(item)) keys.push({ pk: item.pk, sk: item.sk });
      if (mediaSink) collectMedia(item, mediaSink);
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return keys;
}

function collectMedia(item, sink) {
  for (const f of MEDIA_FIELDS) {
    const key = toS3Key(item[f]);
    if (key) sink.add(key);
  }
  for (const f of MEDIA_ARRAY_FIELDS) {
    if (Array.isArray(item[f])) for (const v of item[f]) {
      const key = toS3Key(typeof v === 'string' ? v : v?.key || v?.url);
      if (key) sink.add(key);
    }
  }
}

/** URL/키 → 실제 S3 객체 키(uploads/ 접두 포함). 앱의 extractImageS3Key 규약과 동일. */
function toS3Key(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  if (s.startsWith('//')) s = 'https:' + s;
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const host = (u.hostname || '').toLowerCase();
      const known = host.includes('amazonaws.com') || host.includes('cloudfront.net') || host.includes('chum7.com');
      if (!known) return null; // 외부 링크(인증 링크형 등)는 대상 아님
      s = u.pathname || '';
    }
  } catch { return null; }
  s = s.split('?')[0].split('#')[0].replace(/^\/+/, '');
  if (!s) return null;
  const withoutUploads = s.startsWith('uploads/') ? s.slice('uploads/'.length) : s;
  if (!withoutUploads) return null;
  let decoded = withoutUploads;
  try { decoded = decodeURIComponent(withoutUploads); } catch { /* keep */ }
  return `uploads/${decoded}`;
}

async function batchDelete(table, keys) {
  if (!apply || keys.length === 0) return;
  for (let i = 0; i < keys.length; i += 25) {
    let batch = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
    // UnprocessedItems 재시도(지수 백오프)
    for (let attempt = 0; batch.length && attempt < 6; attempt += 1) {
      const res = await doc.send(new BatchWriteCommand({ RequestItems: { [table]: batch } }));
      batch = res.UnprocessedItems?.[table] ?? [];
      if (batch.length) await sleep(2 ** attempt * 100);
    }
    if (batch.length) throw new Error(`${table}: UnprocessedItems 잔여 ${batch.length}`);
  }
}

async function deleteS3(keys) {
  if (!apply || keys.length === 0) return;
  const arr = [...keys];
  for (let i = 0; i < arr.length; i += 1000) {
    const Objects = arr.slice(i, i + 1000).map((Key) => ({ Key }));
    await s3.send(new DeleteObjectsCommand({ Bucket: UPLOADS_BUCKET, Delete: { Objects, Quiet: true } }));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const media = new Set();
  const summary = [];

  // 1) challenges — 전체 + (S3 대상이면) 미디어 키 수집
  const collectS3 = !skipS3 && Boolean(UPLOADS_BUCKET);
  const chal = await scanKeys(TABLES.challenges, null, collectS3 ? media : null);
  await batchDelete(TABLES.challenges, chal);
  summary.push(['challenges (전체)', chal.length]);

  // 2) cheer / gamification / chat — 전체
  for (const name of ['cheer', 'gamification', 'chat']) {
    const keys = await scanKeys(TABLES[name], null, null);
    await batchDelete(TABLES[name], keys);
    summary.push([`${name} (전체)`, keys.length]);
  }

  // 3) social — 챌린지 연동만(기본) 또는 전체(--wipe-plaza)
  const socialFilter = wipePlaza
    ? null
    : (item) => SOCIAL_CHALLENGE_PREFIXES.some((p) => String(item.pk || '').startsWith(p));
  const social = await scanKeys(TABLES.social, socialFilter, null);
  await batchDelete(TABLES.social, social);
  summary.push([`social (${wipePlaza ? '전체' : 'BOARD/BULL/VER'})`, social.length]);

  // 4) S3 인증 미디어
  if (collectS3) {
    await deleteS3(media);
    summary.push(['S3 인증 미디어 객체', media.size]);
  }

  console.log('=== 결과 ===');
  for (const [label, n] of summary) console.log(`  ${label}: ${n}건 ${apply ? '삭제' : '(dry-run)'}`);
  console.log(`\n${apply ? '✅ 삭제 완료' : '👀 dry-run 완료 — 실제 삭제하려면 --apply --yes-prod'}\n`);
}

run().catch((e) => {
  console.error('❌ 실패:', e);
  process.exit(1);
});
