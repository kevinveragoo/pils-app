#!/bin/bash
# Elisa Kevin Veragoo + ChatGPT
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_plist="$project_dir/ops/launchd/mu.pils.app.plist"
target_plist="/Library/LaunchDaemons/mu.pils.app.plist"

if [[ "$EUID" -ne 0 ]]; then
  exec sudo /bin/bash "$0" "$@"
fi

/usr/bin/plutil -lint "$source_plist"
if [[ -e "$target_plist" ]]; then
  /bin/launchctl bootout system "$target_plist" || true
fi
/usr/bin/install -d -o kevin -g staff -m 700 /Users/kevin/Library/Logs/pils-app
/usr/bin/install -o root -g wheel -m 644 "$source_plist" "$target_plist"
/bin/launchctl bootstrap system "$target_plist"
/bin/launchctl print system/mu.pils.app
