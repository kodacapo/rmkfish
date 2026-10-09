#!/bin/bash
# Deploy the latest master of FISH on the droplet (PM2, behind Caddy).
# Stops at the first problem, before FISH is stopped wherever possible.
# Restarting FISH ends any game in progress: deploy when nobody is playing.
# Usage (as root on the droplet): bash /opt/rmkfish/developer_scripts/deploy-droplet.sh
# Back to an earlier version: git reset --hard <commit>, then run it with --no-pull

# Everything runs from main(), which bash reads whole before running it:
# git pull may replace this very file while it runs.
main() {
  set -euo pipefail

  local APP_DIR=/opt/rmkfish
  local PM2_NAME=Fish
  local SITE=https://rmkfish.duckdns.org/

  cd "$APP_DIR"

  local branch
  branch=$(git rev-parse --abbrev-ref HEAD)
  if [ "$branch" != "master" ]; then
    echo "On branch '$branch', not master. Not deploying."
    exit 1
  fi
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "Files were changed on the droplet itself. Not deploying, so nothing is overwritten:"
    git status --short --untracked-files=no
    exit 1
  fi

  local before after
  before=$(git rev-parse --short HEAD)
  if [ "${1:-}" = "--no-pull" ]; then
    echo "== Not pulling: deploying $before as checked out"
  else
    echo "== Pulling master (now at $before)"
    git pull --ff-only origin master
  fi
  after=$(git rev-parse --short HEAD)
  if [ "$before" = "$after" ]; then
    echo "Already up to date; restarting anyway."
  else
    git log --oneline "$before..$after"
  fi

  if ! git diff --quiet "$before" "$after" -- package-lock.json; then
    echo "== Packages changed: npm ci"
    npm ci
  fi

  # Build while the old FISH still runs, so the site is down only for the restart
  echo "== Building"
  npm run build

  echo "== Restarting $PM2_NAME"
  pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
  FISH_HTTPS_REDIRECT=1 NODE_ENV=production PM2_NAME="$PM2_NAME" npm run serve-pm2-linux
  pm2 save

  echo "== Checking"
  sleep 5
  pm2 status "$PM2_NAME"
  local code
  code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$SITE" || true)
  if [ "$code" = "200" ]; then
    echo "Site OK ($SITE answered 200). Deployed $after."
  else
    echo "WARNING: $SITE answered '$code'. Check: pm2 logs $PM2_NAME --lines 50"
    echo "To go back to the previous version: git reset --hard $before, then run this script with --no-pull."
    exit 1
  fi
}

main "$@"
