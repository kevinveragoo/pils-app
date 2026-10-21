# PILS macOS boot service

Install and start from Terminal (sudo asks for your Mac administrator password):

```sh
cd /Users/kevin/Developer/pils-app
bash scripts/install-launchdaemon.sh
```

Stop any manually started instance on port 3000 before installation. The service
runs `npm run dev -- --hostname 0.0.0.0 --port 3000` as `kevin`, starts at system
boot without a login, and restarts after exit. Do not also start it manually.
The Node installation is pinned to v23.5.0; update the paths in the plist and
reinstall if that installation is removed or replaced.

Check status and HTTP response:

```sh
sudo launchctl print system/mu.pils.app
curl -I http://localhost:3000
tail -n 50 ~/Library/Logs/pils-app/server.log ~/Library/Logs/pils-app/error.log
```

Restart:

```sh
sudo launchctl kickstart -k system/mu.pils.app
```

Uninstall (leaves logs intact):

```sh
sudo launchctl bootout system /Library/LaunchDaemons/mu.pils.app.plist
sudo rm /Library/LaunchDaemons/mu.pils.app.plist
```

After installation, reboot when convenient and confirm the app is available
from another device before logging in. If FileVault requires an unlock after
a cold boot, macOS must first be unlocked before services can run.
