#!/usr/bin/env bash
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$HOME/Library/LaunchAgents/me.logan.morning-digest.plist"
sed "s|REPO_PLACEHOLDER|$REPO|g" "$REPO/scripts/launchd/me.logan.morning-digest.plist" > "$DEST"
launchctl unload "$DEST" 2>/dev/null || true
launchctl load "$DEST"
echo "installed $DEST"
