// Elisa Kevin Veragoo + ChatGPT
"use client";
import { useEffect, useState } from "react";
import { useLocalization } from "@/components/Localization";

type Settings = { enabled: boolean; clinicArrivals: boolean; eligible: boolean; publicKey: string | null };
async function save(body: object) {
  const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to save notification settings.");
}
export default function NotificationSettings() {
  const { t, locale } = useLocalization();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [device, setDevice] = useState(false);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) throw new Error(t("Unable to load notification settings."));
      const data = await response.json();
      if (active) setSettings(data);
      const available = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (active) setSupported(available);
      if (available) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        // Browser subscription alone may belong to a previous login. Enable rebinds it.
        if (active) setDevice(Boolean(subscription && Notification.permission === "granted"));
      }
    })().catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [t]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : t("Unable to save notification settings.")); }
    finally { setBusy(false); }
  }
  async function preferences(next: Settings) {
    await save({ action: "preferences", enabled: next.enabled, clinicArrivals: next.clinicArrivals });
    setSettings(next); setMessage(t("Notification settings saved."));
  }
  async function enableDevice() {
    if (!settings?.publicKey) throw new Error(t("Notifications are not configured."));
    // Request permission directly from the click, before any network awaits (iOS).
    if (await Notification.requestPermission() !== "granted") throw new Error(t("Allow notifications in your browser or phone settings, then try again."));
    await navigator.serviceWorker.register("/notifications-sw.js", { scope: "/", updateViaCache: "none" });
    const registration = await navigator.serviceWorker.ready;
    const key = Uint8Array.from(atob(settings.publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await save({ action: "subscribe", subscription: subscription.toJSON(), locale });
    setDevice(true); setMessage(t("This device is ready for notifications during your current sign-in."));
  }
  async function testDevice() {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) throw new Error(t("Enable notifications on this device first."));
    await save({ action: "test", endpoint: subscription.endpoint });
    setMessage(t("Test notification sent. Check your device notifications."));
  }
  async function disableDevice() {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await save({ action: "unsubscribe", endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    setDevice(false); setMessage(t("Notifications disabled on this device."));
  }
  return <section className="space-y-6">
    <h1 className="text-2xl font-semibold">{t("Notifications")}</h1>
    <p>{t("Choose which updates you receive. Available categories follow your current page access.")}</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!settings && !error && <p>{t("Loading…")}</p>}
    {settings && <>
      <label className="flex items-center gap-3"><input type="checkbox" checked={settings.enabled} disabled={busy} onChange={e => { const enabled = e.target.checked; void run(() => preferences({ ...settings, enabled })); }} />{t("Enable notifications for my account")}</label>
      {settings.eligible ? <label className="flex items-center gap-3"><input type="checkbox" checked={settings.clinicArrivals} disabled={busy || !settings.enabled} onChange={e => { const clinicArrivals = e.target.checked; void run(() => preferences({ ...settings, clinicArrivals })); }} />{t("Clinic Queue — patient arrivals")}</label> : <p>{t("No notification categories are available for your current access.")}</p>}
      <p className="text-sm">{t("Arrival alerts show the patient name and code on your device, including its lock screen. Missing codes appear as Code pending.")}</p>
      <hr />
      <h2 className="text-lg font-semibold">{t("This device")}</h2>
      <p>{t("On iPhone or iPad, add PILS to your Home Screen and open it from there before enabling notifications.")}</p>
      <p className="text-sm">{t("Enable this device again after signing in again. Signing out stops future alerts for that sign-in.")}</p>
      {!supported && <p>{t("Push notifications are unavailable here. Use HTTPS and a supported browser or Home Screen app.")}</p>}
      {!settings.publicKey && <p>{t("Notifications are not configured.")}</p>}
      <div className="flex flex-wrap gap-3">
        <button className="rounded border px-4 py-2" disabled={busy || !supported || !settings.publicKey} onClick={() => void run(enableDevice)}>{t("Enable notifications on this device")}</button>
        {device && <button className="rounded border px-4 py-2" disabled={busy} onClick={() => void run(testDevice)}>{t("Send test notification")}</button>}
        {device && <button className="rounded border px-4 py-2" disabled={busy} onClick={() => void run(disableDevice)}>{t("Disable notifications on this device")}</button>}
      </div>
    </>}
  </section>;
}
