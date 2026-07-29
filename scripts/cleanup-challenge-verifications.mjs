#!/usr/bin/env node
/**
 * 특정 챌린지의 인증(VF#) 정리 — 시작 전 잘못 올라간 인증 게시물 안전 삭제용.
 *
 * 하는 일 (한 challengeId 범위):
 *   1) challenges 테이블 pk=CHAL#<id> 의 VF#... 인증 아이템 삭제 (→ verificationId 수집)
 *   2) 같은 챌린지 참여(UC#...) 중 progress 가 비어있지 않은 항목의 진행기록 초기화
 *      (progress=[], score=0, consecutiveDays=0, currentDay=1) — "이틀 체크"/완료 표시 제거
 *   3) social 테이블 마당 변환분(POST#courtyard-<vid> 전체: META·댓글·리액션) 삭제
 *
 * ⚠️ 되돌릴 수 없습니다. 기본은 dry-run(카운트만). 실제 삭제는 --apply, prod는 --yes-prod 도 필요.
 * 로컬 AWS 자격(활성 프로필/역할)으로 실행합니다.
 *
 * 실행 예:
 *   node scripts/cleanup-challenge-verifications.mjs --stage prod --challenge <ID>                    # dry-run
 *   node scripts/cleanup-challenge-verifications.mjs --stage prod --challenge <ID> --apply --yes-prod # 실제 삭제
 *   옵션: --user <userId>          특정 참여자의 인증/진행기록만 대상(미지정 시 챌린지 전체)
 *         --verification-id <vid>  이미 인증(VF#)을 지운 뒤 마당(POST#courtyard-<vid>)만 정리할 때 직접 지정
 *         --keep-progress          participation progress 초기화 생략(인증/마당만 삭제)
 *         --region <r>             기본 ap-northeast-2 (또는 AWS_REGION)
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const stage = opt('stage');
const challengeId = opt('challenge');
const onlyUser = opt('user');
// 이미 인증(VF#)을 지운 뒤 마당(POST#courtyard-<vid>)만 정리할 때 verificationId 직접 지정
const explicitVid = opt('verification-id');
const apply = has('apply');
const yesProd = has('yes-prod');
const keepProgress = has('keep-progress');
const region = opt('region', process.env.AWS_REGION || 'ap-northeast-2');

if (!stage || !['dev', 'prod'].includes(stage)) {
  console.error('❌ --stage <dev|prod> 필수');
  process.exit(1);
}
if (!challengeId) {
  console.error('❌ --challenge <challengeId> 필수 (챌린지 상세/피드 URL의 ID)');
  process.exit(1);
}
if (apply && stage === 'prod' && !yesProd) {
  console.error('❌ prod 실제 삭제에는 --yes-prod 도 필요합니다. (먼저 dry-run으로 확인하세요)');
  process.exit(1);
}

const prefix = `chme2-${stage}`;
const CHALLENGES = `${prefix}-challenges`;
const SOCIAL = `${prefix}-social`;
const PK = `CHAL#${challengeId}`;

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});

async function queryAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await doc.send(new QueryCommand({ ...params, ExclusiveStartKey }));
    items.push(...(res.Items ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function main() {
  console.log(`\n🔎 ${apply ? '실제 삭제' : 'DRY-RUN'} · stage=${stage} · challenge=${challengeId}` +
    (onlyUser ? ` · user=${onlyUser}` : '') + `\n`);

  // 1) 인증(VF#) 조회
  const vfPrefix = onlyUser ? `VF#${onlyUser}#` : 'VF#';
  const verifications = await queryAll({
    TableName: CHALLENGES,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: { ':pk': PK, ':sk': vfPrefix },
  });
  console.log(`인증(VF#) ${verifications.length}건`);
  for (const v of verifications) {
    console.log(`  - ${v.sk}  (day ${v.day}, ${v.verificationType}, questType=${v.questType ?? '-'}, vid=${v.verificationId})`);
  }
  const vids = verifications.map((v) => String(v.verificationId)).filter(Boolean);
  // 인증을 이미 지운 경우: verificationId 직접 지정분도 마당 정리 대상에 포함
  if (explicitVid && !vids.includes(explicitVid)) vids.push(explicitVid);

  // 2) 참여(UC#) 중 progress 비어있지 않은 항목
  const participations = keepProgress
    ? []
    : (await queryAll({
        TableName: CHALLENGES,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: { ':pk': PK, ':sk': onlyUser ? `UC#${onlyUser}` : 'UC#' },
      })).filter((p) => Array.isArray(p.progress) && p.progress.length > 0);
  if (!keepProgress) {
    console.log(`\n초기화 대상 참여(UC#, progress 있음) ${participations.length}건`);
    for (const p of participations) {
      console.log(`  - ${p.sk}  (progress ${p.progress.length}개, score=${p.score ?? 0}, consecutiveDays=${p.consecutiveDays ?? 0})`);
    }
  }

  // 3) 마당(plaza) 변환분
  let plazaItems = [];
  for (const vid of vids) {
    const items = await queryAll({
      TableName: SOCIAL,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `POST#courtyard-${vid}` },
    });
    plazaItems.push(...items);
  }
  console.log(`\n마당(POST#courtyard-*) 아이템 ${plazaItems.length}건`);
  for (const it of plazaItems) console.log(`  - ${it.pk} / ${it.sk}`);

  if (!apply) {
    console.log(`\n(DRY-RUN) 실제 삭제하려면 --apply${stage === 'prod' ? ' --yes-prod' : ''} 를 붙이세요.\n`);
    return;
  }

  // 실행 ────────────────────────────────────────────────
  for (const v of verifications) {
    await doc.send(new DeleteCommand({ TableName: CHALLENGES, Key: { pk: v.pk, sk: v.sk } }));
  }
  console.log(`\n✅ 인증 ${verifications.length}건 삭제`);

  for (const p of participations) {
    await doc.send(new UpdateCommand({
      TableName: CHALLENGES,
      Key: { pk: p.pk, sk: p.sk },
      UpdateExpression: 'SET progress = :empty, score = :zero, consecutiveDays = :zero, currentDay = :one, updatedAt = :now',
      ExpressionAttributeValues: { ':empty': [], ':zero': 0, ':one': 1, ':now': new Date().toISOString() },
    }));
  }
  if (!keepProgress) console.log(`✅ 참여 진행기록 ${participations.length}건 초기화`);

  for (const it of plazaItems) {
    await doc.send(new DeleteCommand({ TableName: SOCIAL, Key: { pk: it.pk, sk: it.sk } }));
  }
  console.log(`✅ 마당 아이템 ${plazaItems.length}건 삭제`);
  console.log('\n완료.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
