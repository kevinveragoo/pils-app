// Elisa Kevin Veragoo + ChatGPT
// Keep this aligned with Clinic Queue page/API access; tested against the role map.
export function canReceiveClinicArrivals(user) {
  if (user.status !== 'APPROVED' || user.organization?.trim().toUpperCase() !== 'PILS') return false;
  let roles = [];
  try { const parsed = JSON.parse(user.roles || '[]'); if (Array.isArray(parsed)) roles = parsed; } catch { /* Legacy role still applies. */ }
  return [...roles, user.role].some(role => ['FACILITY_STAFF', 'HEALTHCARE_ASSISTANT', 'ADMIN'].includes(role));
}

export function validPushSubscription(value) {
  try {
    const url = new URL(value.endpoint);
    const host = url.hostname;
    const trusted = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host === 'web.push.apple.com' || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
    return trusted && url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && value.endpoint.length < 4096 &&
      /^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh) && /^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth);
  } catch { return false; }
}

export function arrivalPayload(entry, locale = 'en') {
  const labels = {
    en: ['Patient arrived', 'Code pending'],
    fr: ['Patient arrivé', 'Code en attente'],
    mfe: ['Pasyan finn arive', 'Kod an atant'],
  }[locale] || ['Patient arrived', 'Code pending'];
  return { title: labels[0], body: `${entry.displayName.slice(0, 160)} · ${entry.patientCode?.trim() || labels[1]}`, tag: `clinic-arrival-${entry.id}`, url: '/clinic-queue' };
}
