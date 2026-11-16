#!/bin/bash
#
#  install-caddy-launchdaemon.sh
#  pils-app
#
#  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
#
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_plist="$project_dir/ops/launchd/mu.pils.caddy.plist"
target_plist="/Library/LaunchDaemons/mu.pils.caddy.plist"
if [[ "$EUID" -ne 0 ]]; then
  exec sudo /bin/bash "$0" "$@"
fi
/usr/bin/plutil -lint "$source_plist"
# Validate as the same user that will run Caddy and own its certificate storage.
/usr/bin/sudo -u kevin /opt/homebrew/bin/caddy validate --config "$project_dir/ops/caddy/Caddyfile" --adapter caddyfile
/usr/bin/install -d -o kevin -g staff -m 700 /Users/kevin/Library/Logs/pils-app
if /bin/launchctl print system/mu.pils.caddy >/dev/null 2>&1; then
  /bin/launchctl bootout system "$target_plist"
fi
/usr/bin/install -o root -g wheel -m 644 "$source_plist" "$target_plist"
/bin/launchctl bootstrap system "$target_plist"
/bin/launchctl print system/mu.pils.caddy
