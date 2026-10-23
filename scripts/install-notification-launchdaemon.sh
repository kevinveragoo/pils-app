#!/bin/bash
# Elisa Kevin Veragoo + ChatGPT
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_plist="$project_dir/ops/launchd/mu.pils.notifications.plist"
target_plist="/Library/LaunchDaemons/mu.pils.notifications.plist"
if [[ "$EUID" -ne 0 ]]; then
  exec sudo /bin/bash "$0" "$@"
fi
/usr/bin/plutil -lint "$source_plist"
/usr/bin/install -d -o kevin -g staff -m 700 /Users/kevin/Library/Logs/pils-app
if /bin/launchctl print system/mu.pils.notifications >/dev/null 2>&1; then
  /bin/launchctl bootout system "$target_plist"
fi
/usr/bin/install -o root -g wheel -m 644 "$source_plist" "$target_plist"
/bin/launchctl bootstrap system "$target_plist"
/bin/launchctl print system/mu.pils.notifications
