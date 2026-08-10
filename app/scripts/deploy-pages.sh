#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT_NAME:-risebay}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-${CF_ACCOUNT_ID:-}}"
API_TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_API_TOKEN:-}}"
DIST_DIR="${1:-dist}"

if [[ -z "$API_TOKEN" ]]; then
  echo "Error: CLOUDFLARE_API_TOKEN is required for Pages deploys."
  exit 1
fi

if [[ -z "$ACCOUNT_ID" ]]; then
  echo "Error: CLOUDFLARE_ACCOUNT_ID is required for Pages deploys."
  exit 1
fi

if [[ ! "$ACCOUNT_ID" =~ ^[a-fA-F0-9]{32}$ ]]; then
  echo "Error: CLOUDFLARE_ACCOUNT_ID must be a 32-character hex string."
  exit 1
fi

npx wrangler pages deploy "$DIST_DIR" \
  --project-name "$PROJECT_NAME" \
  --account-id "$ACCOUNT_ID"
