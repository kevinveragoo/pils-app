# HTTPS on the Mac Mini

Caddy serves `https://eli3a.ddns.net` and proxies to the existing app on
`127.0.0.1:3000`. Certificates and renewals are automatic once the public
hostname points to this network and certificate validation can reach Caddy.
Keep the No-IP updater running and confirm the free hostname every 30 days.

## Installation

Caddy is installed with Homebrew. Install its boot service from Terminal:

```sh
cd /Users/kevin/Developer/pils-app
bash scripts/install-caddy-launchdaemon.sh
```

Enter the Mac administrator password when prompted. The service runs as kevin,
starts at boot, and restarts on exit. Like the app service, a FileVault cold
boot can require an initial unlock. Do not additionally start a Homebrew Caddy
service or a manual Caddy instance.

Change router TCP port forwarding to the Mac Mini's reserved LAN address:

| External port | Internal port | Purpose |
| --- | --- | --- |
| 80 | 80 | Certificate validation and HTTPS redirect |
| 443 | 443 | HTTPS app access |

Replace the old external 80 → internal 3000 rule. Do not forward Caddy's admin
port 2019. Allow Caddy through the macOS firewall if prompted.

## Verify and finish

```sh
sudo launchctl print system/mu.pils.caddy
curl -I http://127.0.0.1 -H 'Host: eli3a.ddns.net'
curl -I https://eli3a.ddns.net
 tail -n 40 ~/Library/Logs/pils-app/caddy-error.log
```

HTTP should redirect to HTTPS. HTTPS must pass certificate validation without
`-k` and return the app response (normally a redirect to `/login`). Also verify
on a phone with Wi-Fi disabled to test genuinely external access.

Only after HTTPS works, set `AUTH_COOKIE_SECURE=true` in `.env.local` and restart
the app. Existing HTTP logins will then need to use HTTPS. The currently
installed app service still uses `next dev`; production build/service cutover
is a separate pending step and must be coordinated so it does not conflict
with the running development server's `.next` files.

## Troubleshooting / rollback

If certificate issuance fails, check DNS, router forwarding, ISP filtering,
CGNAT, and any stale AAAA record. Caddy logs explain validation failures.
Router hairpin NAT may affect testing the public hostname from inside the LAN.

To stop Caddy:

```sh
sudo launchctl bootout system /Library/LaunchDaemons/mu.pils.caddy.plist
```

To restore the previous HTTP arrangement, restore external 80 → internal 3000
and `AUTH_COOKIE_SECURE=false`, then restart the app if that value changed.
