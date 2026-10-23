// Elisa Kevin Veragoo + ChatGPT
import { PrismaClient } from '@prisma/client';
import webpush from 'web-push';
import { sendArrivalNotifications } from '../lib/notification-sender.mjs';
const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('Configure VAPID_SUBJECT, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY first.');
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const db = new PrismaClient();
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
try {
  do {
    try { await sendArrivalNotifications(db, webpush.sendNotification); }
    catch { console.error('Notification worker cycle failed; retrying.'); }
    if (process.argv.includes('--once')) break;
    await new Promise(resolve => setTimeout(resolve, 3000));
  } while (!stopping);
} finally { await db.$disconnect(); }
