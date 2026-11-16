//
//  setup-notifications.mjs
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import fs from 'node:fs';
import webpush from 'web-push';
const path = '.env.local';
let source = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
if (!/^VAPID_PUBLIC_KEY=.+$/m.test(source) && !/^VAPID_PRIVATE_KEY=.+$/m.test(source)) {
  const keys = webpush.generateVAPIDKeys();
  source += `\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`;
} else if (!/^VAPID_PUBLIC_KEY=.+$/m.test(source) || !/^VAPID_PRIVATE_KEY=.+$/m.test(source)) {
  throw new Error('Incomplete VAPID key pair. Restore both original keys; do not rotate an active key pair.');
}
if (!/^VAPID_SUBJECT=.+$/m.test(source)) source += '\nVAPID_SUBJECT=https://eli3a.ddns.net\n';
fs.writeFileSync(path, source, { mode: 0o600 });
console.log('Notification keys configured in .env.local; private key not displayed. Existing keys preserved.');
