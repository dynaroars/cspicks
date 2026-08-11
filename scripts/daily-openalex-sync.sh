#!/bin/bash
# Cron entry point for the multi-week OpenAlex ROR-capture backfill.
# Runs one daily-budget batch, then commits + pushes only if the result
# passes basic sanity checks (professor count didn't shrink, tests pass).
# A failed push is not fatal - the commit still lands locally and can be
# pushed by hand later.
set -uo pipefail

REPO_DIR="/home/tnguyen/git/projects/cspicks"
KEY_FILE="$HOME/.config/cspicks/openalex-api-key"
LOG_FILE="$REPO_DIR/.openalex-cron.log"
export SSH_AUTH_SOCK="/run/user/1000/gcr/ssh"
export PATH="/usr/bin:/bin:$PATH"

cd "$REPO_DIR" || exit 1

echo "=== $(date -Iseconds) ===" >> "$LOG_FILE"

if [ ! -f "$KEY_FILE" ]; then
    echo "ABORT: no API key at $KEY_FILE" >> "$LOG_FILE"
    exit 1
fi
export OPENALEX_API_KEY
OPENALEX_API_KEY=$(cat "$KEY_FILE")

BEFORE_COUNT=$(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('public/professor_history_openalex.json'))).length)")

node scripts/build-openalex-history.js --daily-budget=900 >> "$LOG_FILE" 2>&1

AFTER_COUNT=$(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('public/professor_history_openalex.json'))).length)")

if [ "$AFTER_COUNT" -lt "$BEFORE_COUNT" ]; then
    echo "ABORT: professor count shrank ($BEFORE_COUNT -> $AFTER_COUNT), reverting and not committing" >> "$LOG_FILE"
    git checkout -- public/professor_history_openalex.json public/school-aliases.json
    exit 1
fi

if ! git diff --quiet public/professor_history_openalex.json public/school-aliases.json; then
    if ! npm test >> "$LOG_FILE" 2>&1; then
        echo "ABORT: tests failed, reverting and not committing" >> "$LOG_FILE"
        git checkout -- public/professor_history_openalex.json public/school-aliases.json
        exit 1
    fi

    git add public/professor_history_openalex.json public/school-aliases.json
    git commit -m "Daily OpenAlex ROR sync ($(date +%Y-%m-%d))

Automated: scripts/daily-openalex-sync.sh via cron." >> "$LOG_FILE" 2>&1

    if git push origin main >> "$LOG_FILE" 2>&1; then
        echo "Pushed successfully." >> "$LOG_FILE"
    else
        echo "WARNING: push failed (commit is still local, safe to push manually later)." >> "$LOG_FILE"
    fi
else
    echo "No changes this run (quota likely exhausted immediately, or nothing new fetched)." >> "$LOG_FILE"
fi

echo "=== done $(date -Iseconds) ===" >> "$LOG_FILE"
