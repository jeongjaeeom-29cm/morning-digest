#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"
export REPO_ROOT

LOG_DIR="$REPO_ROOT/_workspace/logs"
mkdir -p "$LOG_DIR"
STAMP="$(date +%F)"

{
  echo "=== daily run $STAMP ==="
  git pull --ff-only || true
  pnpm install --frozen-lockfile || exit 0
  pnpm digest:daily || exit 0
  if [[ -n "$(git status --porcelain src/content/items public/search-index.json)" ]]; then
    git add src/content/items public/search-index.json
    git commit -m "chore: digest $STAMP"
    git push
  else
    echo "no changes"
  fi
} >> "$LOG_DIR/launchd.out.log" 2>> "$LOG_DIR/launchd.err.log"
exit 0
