#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$ROOT_DIR/infra"
PROJECT_NAME="nestjs-apis"
_ECR_REPO="nestjs-apis-app"

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/opt/local/bin:$PATH"

_PREFLIGHT_ARN=""
_PREFLIGHT_URL=""
_GH_REPO=""
_GH_RUN_ST=""
_OPTION3_LABEL=""
_DEFAULT_CHOICE=2

# ── Utility ───────────────────────────────────────────────────────────────────

_ecr_image_exists() {
  aws ecr describe-images --repository-name "$_ECR_REPO" --image-ids "imageTag=$1" \
    >/dev/null 2>&1
}

# ── Preflight ─────────────────────────────────────────────────────────────────

_run_preflight() {
  printf '[preflight] Checking AWS credentials... '
  if ! command -v aws >/dev/null 2>&1 || ! aws sts get-caller-identity >/dev/null 2>&1; then
    printf 'failed\n'; return
  fi
  printf 'ok\n'

  if [[ -d "$INFRA_DIR" ]]; then
    printf '[preflight] Reading Terraform state... '
    _PREFLIGHT_ARN="$(cd "$INFRA_DIR" && terraform output -raw apprunner_service_arn 2>/dev/null || true)"
    _PREFLIGHT_URL="$(cd "$INFRA_DIR" && terraform output -raw service_url 2>/dev/null || true)"
    [[ -n "$_PREFLIGHT_ARN" ]] && printf 'ARN found\n' || printf 'empty\n'
  fi

  if [[ -z "$_PREFLIGHT_ARN" ]]; then
    printf '[preflight] Querying App Runner... '
    local _TMP
    _TMP="$(aws apprunner list-services \
      --query "ServiceSummaryList[?ServiceName=='${_ECR_REPO}'].ServiceArn | [0]" \
      --output text 2>/dev/null || true)"
    if [[ "$_TMP" != "None" && -n "$_TMP" ]]; then
      _PREFLIGHT_ARN="$_TMP"; printf 'found\n'
    else
      printf 'not found\n'
    fi
  fi

  [[ -n "$_PREFLIGHT_ARN" ]] && _preflight_check_gh_run
}

_preflight_check_gh_run() {
  local _LOCAL_SHA _LOCAL_MSG _LOCAL_AGO
  _LOCAL_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo '')"
  _LOCAL_MSG="$(git -C "$ROOT_DIR" log -1 --format='%s' 2>/dev/null || echo '')"
  _LOCAL_AGO="$(git -C "$ROOT_DIR" log -1 --format='%ar' 2>/dev/null || echo '')"
  printf '[preflight] HEAD commit : %s — "%s" (%s)\n' "${_LOCAL_SHA:-unknown}" "$_LOCAL_MSG" "$_LOCAL_AGO"

  if ! command -v gh >/dev/null 2>&1; then return; fi

  _GH_REPO="$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null \
    | sed 's|.*github\.com[:/]\(.*\)\.git$|\1|; s|.*github\.com[:/]\(.*\)$|\1|')"

  local _GH_RUN_JSON
  _GH_RUN_JSON="$(gh run list --limit 1 \
    --json databaseId,status,conclusion,headSha,displayTitle 2>/dev/null || echo '')"
  local _GH_RUN_ID _GH_RUN_SHA _GH_RUN_TITLE
  _GH_RUN_ID="$(printf '%s' "$_GH_RUN_JSON" | python3 -c \
    "import sys,json; r=json.load(sys.stdin); print(r[0]['databaseId'] if r else '')" 2>/dev/null || echo '')"
  _GH_RUN_ST="$(printf '%s' "$_GH_RUN_JSON" | python3 -c \
    "import sys,json; r=json.load(sys.stdin); o=r[0] if r else {}; co=o.get('conclusion') or ''; st=o.get('status',''); print(st+'/'+co if co else st)" 2>/dev/null || echo '')"
  _GH_RUN_SHA="$(printf '%s' "$_GH_RUN_JSON" | python3 -c \
    "import sys,json; r=json.load(sys.stdin); print(r[0]['headSha'][:7] if r else '')" 2>/dev/null || echo '')"
  _GH_RUN_TITLE="$(printf '%s' "$_GH_RUN_JSON" | python3 -c \
    "import sys,json; r=json.load(sys.stdin); print(r[0]['displayTitle'] if r else '')" 2>/dev/null || echo '')"
  printf '[preflight] GH Actions  : %s · %s · %s\n' "$_GH_RUN_ST" "$_GH_RUN_SHA" "$_GH_RUN_TITLE"

  if [[ "$_GH_RUN_ST" == "in_progress" || "$_GH_RUN_ST" == "queued" || "$_GH_RUN_ST" == "waiting" ]] \
      && [[ -n "$_GH_RUN_ID" ]]; then
    _preflight_wait_gh_run "$_GH_RUN_ID"
  fi

  local _LOCAL_SHA2 _LOCAL_AGO2
  _LOCAL_SHA2="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo '')"
  _LOCAL_AGO2="$(git -C "$ROOT_DIR" log -1 --format='%ar' 2>/dev/null || echo '')"
  printf '[preflight] Checking ECR for %s... ' "${_LOCAL_SHA2:-unknown}"
  if [[ -n "$_LOCAL_SHA2" ]] && _ecr_image_exists "$_LOCAL_SHA2"; then
    printf 'built\n'
    _OPTION3_LABEL="Quick  — redeploy ECR:latest direct to App Runner · HEAD=${_LOCAL_SHA2} (${_LOCAL_AGO2})"
    _DEFAULT_CHOICE=3
  else
    printf 'not built yet\n'
    _OPTION3_LABEL="Quick  — HEAD=${_LOCAL_SHA2:-unknown} not yet in ECR · will poll GH Actions until built, then deploy"
  fi
}

_preflight_wait_gh_run() {
  local run_id="$1" _gh_t0 _gh_view _gh_cur_st _gh_conclusion
  printf '[preflight] Waiting for GH Actions to finish (polls every 20s)...\n'
  _gh_t0=$(date +%s)
  while true; do
    sleep 20
    _gh_view="$(gh run view "$run_id" --json status,conclusion 2>/dev/null || echo '')"
    _gh_cur_st="$(printf '%s' "$_gh_view" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || echo '')"
    printf '\r  %s (%ds)...' "${_gh_cur_st:-waiting}" $(( $(date +%s) - _gh_t0 ))
    if [[ "$_gh_cur_st" != "in_progress" && "$_gh_cur_st" != "queued" && "$_gh_cur_st" != "waiting" ]]; then
      printf '\n'; break
    fi
  done
  _gh_conclusion="$(printf '%s' "$_gh_view" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('conclusion') or '')" 2>/dev/null || echo '')"
  _GH_RUN_ST="completed/${_gh_conclusion}"
}

# ── Option 1: local dev ───────────────────────────────────────────────────────

_deploy_local() {
  cd "$ROOT_DIR"
  npm install --prefer-offline || npm install
  exec npm run start:dev
}

# ── Option 2: full cloud deploy ───────────────────────────────────────────────

_deploy_cloud() {
  printf '\n[1/4] Checking AWS credentials...\n'
  aws sts get-caller-identity >/dev/null
  printf '  OK\n'

  _GH_REPO="$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null \
    | sed 's|.*github\.com[:/]\(.*\)\.git$|\1|; s|.*github\.com[:/]\(.*\)$|\1|')"

  if command -v gh >/dev/null 2>&1 && [[ -n "$_GH_REPO" ]]; then
    printf '  Syncing AWS credentials to GitHub Actions secrets (%s)...\n' "$_GH_REPO"
    local _AWS_REGION
    _AWS_REGION="$(aws configure get region 2>/dev/null || echo 'us-east-1')"
    aws configure get aws_access_key_id     | gh secret set AWS_ACCESS_KEY_ID     --repo "$_GH_REPO"
    aws configure get aws_secret_access_key | gh secret set AWS_SECRET_ACCESS_KEY --repo "$_GH_REPO"
    printf '%s' "$_AWS_REGION"              | gh secret set AWS_REGION            --repo "$_GH_REPO"
  fi

  printf '[2/4] Provisioning infrastructure (terraform apply)...\n'
  cd "$INFRA_DIR"
  terraform init -input=false -upgrade >/dev/null

  local ECR_IMAGE_EXISTS
  ECR_IMAGE_EXISTS="$(aws ecr describe-images \
    --repository-name "$_ECR_REPO" --image-ids imageTag=latest \
    --query 'imageDetails[0].imageDigest' --output text 2>/dev/null || true)"

  if [[ -z "$ECR_IMAGE_EXISTS" || "$ECR_IMAGE_EXISTS" == "None" ]]; then
    printf '  First deploy — provisioning ECR before image build.\n'
    terraform apply -auto-approve -input=false \
      -target=aws_ecr_repository.app \
      -target=aws_ecr_lifecycle_policy.app
    printf '  ECR ready. Waiting for GitHub Actions to build the image...\n'
    printf '  Push a commit or trigger Actions manually, then re-run deploy.sh (option 3).\n'
    exit 0
  else
    terraform apply -auto-approve -input=false
  fi

  local _AR_ARN
  _AR_ARN="$(terraform output -raw apprunner_service_arn)"
  local _SVC_URL
  _SVC_URL="$(terraform output -raw service_url)"

  printf '[3/4] Verifying ECR image...\n'
  local _REMOTE_SHA
  _REMOTE_SHA="$(git -C "$ROOT_DIR" ls-remote origin HEAD 2>/dev/null | cut -c1-7)"
  local _DEPLOY_TAG="${_REMOTE_SHA:-latest}"
  if ! _ecr_image_exists "$_DEPLOY_TAG"; then
    _DEPLOY_TAG=latest
  fi
  local _MANIFEST
  _MANIFEST="$(aws ecr batch-get-image --repository-name "$_ECR_REPO" \
    --image-ids "imageTag=${_DEPLOY_TAG}" --query 'images[0].imageManifest' --output text 2>/dev/null)"
  if [[ "$_DEPLOY_TAG" != "latest" ]]; then
    aws ecr put-image --repository-name "$_ECR_REPO" --image-tag latest \
      --image-manifest "$_MANIFEST" >/dev/null 2>&1 || true
    printf '  Re-tagged %s as latest.\n' "$_DEPLOY_TAG"
  fi

  printf '[4/4] Deploying to App Runner...\n'
  local status
  status="$(aws apprunner describe-service --service-arn "$_AR_ARN" --query 'Service.Status' --output text)"
  if [[ "$status" == "OPERATION_IN_PROGRESS" ]]; then
    _wait_apprunner_idle "$_AR_ARN"
  fi
  aws apprunner start-deployment --service-arn "$_AR_ARN" >/dev/null
  _wait_apprunner_running "$_AR_ARN"

  printf '\n  Service URL: %s\n' "$_SVC_URL"

  _seed_check_offer
}

# ── Option 3: quick redeploy ──────────────────────────────────────────────────

_deploy_quick() {
  printf '\n[quick] Checking AWS credentials...\n'
  aws sts get-caller-identity >/dev/null
  printf '  OK\n'

  local _AR_ARN="$_PREFLIGHT_ARN"
  local _SVC_URL="$_PREFLIGHT_URL"

  if [[ -z "$_AR_ARN" ]]; then
    printf '[quick] Querying App Runner...\n'
    _AR_ARN="$(aws apprunner list-services \
      --query "ServiceSummaryList[?ServiceName=='${_ECR_REPO}'].ServiceArn | [0]" \
      --output text 2>/dev/null || true)"
    [[ "$_AR_ARN" == "None" || -z "$_AR_ARN" ]] && { printf 'ERROR: no App Runner service found — run a full deploy (option 2) first.\n'; exit 1; }
  fi

  ! _ecr_image_exists "latest" && { printf 'ERROR: no latest image in ECR — push to GitHub and wait for Actions build first.\n'; exit 1; }

  local _HEAD_SHA _IMAGE_CHANGED
  _HEAD_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
  _IMAGE_CHANGED=0

  if ! _ecr_image_exists "$_HEAD_SHA"; then
    _quick_wait_ecr_image "$_HEAD_SHA"
    _IMAGE_CHANGED=1
  else
    local _SHA_DIGEST _LATEST_DIGEST
    _SHA_DIGEST="$(aws ecr describe-images --repository-name "$_ECR_REPO" \
      --image-ids "imageTag=${_HEAD_SHA}" --query 'imageDetails[0].imageDigest' --output text 2>/dev/null || echo '')"
    _LATEST_DIGEST="$(aws ecr describe-images --repository-name "$_ECR_REPO" \
      --image-ids "imageTag=latest" --query 'imageDetails[0].imageDigest' --output text 2>/dev/null || echo '')"
    if [[ -z "$_SHA_DIGEST" || "$_SHA_DIGEST" != "$_LATEST_DIGEST" ]]; then
      printf '[quick] Re-tagging %s as latest...\n' "$_HEAD_SHA"
      local _MANIFEST
      _MANIFEST="$(aws ecr batch-get-image --repository-name "$_ECR_REPO" \
        --image-ids "imageTag=${_HEAD_SHA}" --query 'images[0].imageManifest' --output text 2>/dev/null)"
      aws ecr put-image --repository-name "$_ECR_REPO" --image-tag latest \
        --image-manifest "$_MANIFEST" >/dev/null 2>&1 || true
      _IMAGE_CHANGED=1
    else
      printf '[quick] ECR latest already at HEAD (%s) — no re-tag needed.\n' "$_HEAD_SHA"
    fi
  fi

  _wait_apprunner_idle "$_AR_ARN"

  if [[ "$_IMAGE_CHANGED" -eq 0 ]]; then
    printf '[quick] Image unchanged — skipping redeploy.\n'
    [[ -z "$_SVC_URL" ]] && _SVC_URL="https://$(aws apprunner describe-service --service-arn "$_AR_ARN" \
      --query 'Service.ServiceUrl' --output text 2>/dev/null || true)"
    printf '\n  Service URL: %s\n' "${_SVC_URL:-}"
    exit 0
  fi

  printf '[quick] Starting App Runner deployment...\n'
  aws apprunner start-deployment --service-arn "$_AR_ARN" >/dev/null
  _wait_apprunner_running "$_AR_ARN"

  [[ -z "$_SVC_URL" ]] && _SVC_URL="https://$(aws apprunner describe-service --service-arn "$_AR_ARN" \
    --query 'Service.ServiceUrl' --output text 2>/dev/null || true)"
  printf '\n  Service URL: %s\n' "${_SVC_URL:-}"
  exit 0
}

_quick_wait_ecr_image() {
  local sha="$1"
  printf '[quick] Waiting for ECR image %s (up to 15 min)...\n' "$sha"
  local elapsed=0
  until _ecr_image_exists "$sha"; do
    if (( elapsed >= 900 )); then
      printf '  Timed out. Check: https://github.com/%s/actions\n' "${_GH_REPO:-}"
      exit 1
    fi
    sleep 30; elapsed=$(( elapsed + 30 ))
    printf '  ...%ds elapsed\n' "$elapsed"
  done
  printf '  Image %s ready.\n' "$sha"
  local manifest
  manifest="$(aws ecr batch-get-image --repository-name "$_ECR_REPO" \
    --image-ids "imageTag=${sha}" --query 'images[0].imageManifest' --output text 2>/dev/null)"
  aws ecr put-image --repository-name "$_ECR_REPO" --image-tag latest \
    --image-manifest "$manifest" >/dev/null 2>&1 || true
}

# ── App Runner wait helpers ───────────────────────────────────────────────────

_wait_apprunner_idle() {
  local arn="$1"
  local status
  status="$(aws apprunner describe-service --service-arn "$arn" --query 'Service.Status' --output text)"
  [[ "$status" != "OPERATION_IN_PROGRESS" ]] && return
  printf '  App Runner in progress — waiting...\n'
  local t0=$(date +%s)
  while [[ "$status" == "OPERATION_IN_PROGRESS" ]]; do
    sleep 20
    status="$(aws apprunner describe-service --service-arn "$arn" --query 'Service.Status' --output text)"
    printf '\r  %s... (%ds)' "$status" $(( $(date +%s) - t0 ))
  done
  printf '\n'
}

_wait_apprunner_running() {
  local arn="$1"
  local t0=$(date +%s) status
  while true; do
    status="$(aws apprunner describe-service --service-arn "$arn" --query 'Service.Status' --output text)"
    if [[ "$status" == "RUNNING" ]]; then printf '\r  Running (%ds).  \n' $(( $(date +%s) - t0 )); break; fi
    if [[ "$status" == "UPDATE_FAILED" || "$status" == "CREATE_FAILED" ]]; then
      printf '\nERROR: App Runner %s.\n' "$status"; exit 1
    fi
    printf '\r  %s... (%ds)' "$status" $(( $(date +%s) - t0 ))
    sleep 20
  done
}

# ── Seed check ────────────────────────────────────────────────────────────────

_seed_check_offer() {
  printf '\n[seed] Checking DynamoDB item count (approximate)...\n'
  local _COUNT
  _COUNT="$(aws dynamodb describe-table --table-name Products \
    --query 'Table.ItemCount' --output text 2>/dev/null || echo 0)"
  printf '  Current item count: ~%s\n' "${_COUNT:-0}"

  if (( ${_COUNT:-0} >= 1000000 )); then
    printf '  Table already has ~%s items — skipping seed.\n' "$_COUNT"
    return
  fi

  printf '  Table has fewer than 1M items. Seed 4M synthetic products? [y/N]: '
  read -r _DO_SEED; _DO_SEED="${_DO_SEED:-N}"
  if [[ ! "$_DO_SEED" =~ ^[Yy] ]]; then
    printf '  Skipping seed. Run: npm run seed:synthetic -- --count=4000000\n'
    return
  fi

  printf '  Seeding 4M items in background (takes ~40-60 min)...\n'
  cd "$ROOT_DIR"
  npm install --prefer-offline >/dev/null 2>&1 || npm install >/dev/null 2>&1
  nohup npx ts-node scripts/seed-synthetic-products.ts --count=4000000 \
    > /tmp/nestjs-apis-seed.log 2>&1 &
  printf '  Seed PID %s — tail /tmp/nestjs-apis-seed.log to monitor.\n' "$!"
}

# ── Menu ──────────────────────────────────────────────────────────────────────

_run_preflight

printf '\n'
printf 'Deploy %s\n' "$PROJECT_NAME"
printf '%-6s %s\n' "1." "Local  — npm run start:dev"
printf '%-6s %s\n' "2." "Cloud  — full Terraform + ECR + App Runner deploy"
if [[ -n "$_OPTION3_LABEL" ]]; then
  printf '%-6s %s\n' "3." "$_OPTION3_LABEL"
fi
printf '\n'
printf 'Choice [%s]: ' "$_DEFAULT_CHOICE"
read -r CHOICE; CHOICE="${CHOICE:-$_DEFAULT_CHOICE}"

case "$CHOICE" in
  1) _deploy_local ;;
  2) _deploy_cloud ;;
  3) _deploy_quick ;;
  *) printf 'Unknown choice: %s\n' "$CHOICE"; exit 1 ;;
esac
