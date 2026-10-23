//
//  route.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import webpush from "web-push";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";
import { db } from "@/lib/db";
import { canReceiveClinicArrivals, validPushSubscription } from "@/lib/notification-policy.mjs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const preference = await db.notificationPreference.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ enabled: preference?.enabled ?? false, clinicArrivals: canReceiveClinicArrivals(user) && (preference?.clinicArrivals ?? false), eligible: canReceiveClinicArrivals(user), publicKey: process.env.VAPID_PUBLIC_KEY || null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || URL.parse(origin)?.host !== host) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length") || 0) > 10000) return NextResponse.json({ error: "Request too large." }, { status: 413 });
    const body = await request.json();
    if (body.action === "preferences") {
      if (typeof body.enabled !== "boolean" || typeof body.clinicArrivals !== "boolean") throw new Error("Invalid preferences.");
      if (body.enabled && body.clinicArrivals && !canReceiveClinicArrivals(user)) return NextResponse.json({ error: "Clinic Queue access is required." }, { status: 403 });
      const previous = await db.notificationPreference.findUnique({ where: { userId: user.id } });
      const activating = body.enabled && body.clinicArrivals && (!previous?.enabled || !previous?.clinicArrivals);
      await db.notificationPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, enabled: body.enabled, clinicArrivals: body.clinicArrivals }, update: { enabled: body.enabled, clinicArrivals: body.clinicArrivals, ...(activating ? { enabledAt: new Date() } : {}) } });
    } else if (body.action === "subscribe") {
      if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return NextResponse.json({ error: "Notifications are not configured." }, { status: 503 });
      if (!validPushSubscription(body.subscription)) throw new Error("Unsupported push subscription.");
      const token = (await cookies()).get(SESSION_COOKIE)?.value || "";
      const session = await db.session.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
      if (!session || session.userId !== user.id || session.expiresAt <= new Date()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
      const { endpoint, keys } = body.subscription;
      const locale = ["en", "fr", "mfe"].includes(body.locale) ? body.locale : "en";
      const count = await db.pushSubscription.count({ where: { userId: user.id } });
      const existing = await db.pushSubscription.findUnique({ where: { endpoint } });
      if (count >= 10 && existing?.userId !== user.id) throw new Error("Device limit reached. Disable notifications on another device first.");
      // Replace instead of transfer, so old account deliveries never follow a shared device.
      await db.$transaction(async tx => {
        await tx.pushSubscription.deleteMany({ where: { endpoint } });
        await tx.pushSubscription.create({ data: { userId: user.id, sessionId: session.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, locale } });
      });
    } else if (body.action === "test") {
      if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) return NextResponse.json({ error: "Notifications are not configured." }, { status: 503 });
      const subscription = await db.pushSubscription.findFirst({ where: { userId: user.id, endpoint: typeof body.endpoint === "string" ? body.endpoint : "" } });
      const session = subscription && await db.session.findFirst({ where: { id: subscription.sessionId, userId: user.id, expiresAt: { gt: new Date() } } });
      if (!subscription || !session) throw new Error("Enable notifications on this device first.");
      const bodyText = subscription.locale === "fr" ? "Les notifications fonctionnent sur cet appareil." : subscription.locale === "mfe" ? "Bann notifikasion pe marse lor sa laparey-la." : "Notifications are working on this device.";
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: "PILS", body: bodyText, tag: "pils-test" }), { TTL: 60, timeout: 10000, vapidDetails: { subject: process.env.VAPID_SUBJECT, publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY } });
    } else if (body.action === "unsubscribe") {
      if (typeof body.endpoint !== "string") throw new Error("Invalid subscription.");
      await db.pushSubscription.deleteMany({ where: { userId: user.id, endpoint: body.endpoint } });
    } else throw new Error("Invalid action.");
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SyntaxError ? "Invalid request." : error instanceof Error && !error.message.includes("prisma") ? error.message : "Unable to save notification settings." }, { status: 400 });
  }
}
