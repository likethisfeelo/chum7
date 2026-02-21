#!/usr/bin/env bash
set -euo pipefail

echo "[1/7] Tool versions"
node -v || true
npm -v || true
cdk --version || true
aws --version || true

echo
 echo "[2/7] AWS caller identity"
aws sts get-caller-identity || true

echo
 echo "[3/7] AWS configure list"
aws configure list || true

echo
 echo "[4/7] Install deps"
npm ci || true

echo
 echo "[5/7] Build"
npm run build || true

echo
 echo "[6/7] CDK synth (verbose)"
cdk synth -v || true

echo
 echo "[7/7] CDK deploy (verbose, no-approval)"
cdk deploy -v --require-approval never || true

echo
 echo "Done. 위 출력에서 처음 실패하는 단계의 에러 메시지를 확인하세요."