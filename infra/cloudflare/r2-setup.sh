#!/usr/bin/env bash
set -euo pipefail

# OncoFlow — Cloudflare R2 bucket setup (manual apply)
# Prerequisites: wrangler CLI installed + logged in (npx wrangler login)
# Requires: CLOUDFLARE_ACCOUNT_ID env var

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"

echo ">>> Creating R2 bucket: oncoflow-uploads"
npx wrangler r2 bucket create oncoflow-uploads

echo ">>> Creating R2 bucket: oncoflow-virus-scan"  
npx wrangler r2 bucket create oncoflow-virus-scan

echo ">>> Done."
echo ""
echo "Add these secrets to Coolify/GitHub Actions:"
echo "  R2_ACCOUNT_ID=$ACCOUNT_ID"
echo "  R2_ACCESS_KEY_ID=<from R2 dashboard>"
echo "  R2_SECRET_ACCESS_KEY=<from R2 dashboard>"
echo "  R2_BUCKET_NAME=oncoflow-uploads"
echo "  R2_PUBLIC_URL=https://uploads.oncoflow.com.ng"