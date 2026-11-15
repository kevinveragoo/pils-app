//
//  notification-policy.mjs
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
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

// Matches PILS Outreach page access; external organisations never receive these alerts.
export function canReceiveOutreachHivReactive(user) {
  if (user.status !== 'APPROVED' || user.organization?.trim().toUpperCase() !== 'PILS') return false;
  let roles = [];
  try { const parsed = JSON.parse(user.roles || '[]'); if (Array.isArray(parsed)) roles = parsed; } catch { /* Legacy role still applies. */ }
  return [...roles, user.role].some(role => ['OUTREACH_WORKER', 'HEALTHCARE_ASSISTANT', 'ADMIN'].includes(role));
}

export function outreachHivReactivePayload(recordId, key, locale = 'en') {
  const body = {
    en: 'A new Outreach contact needs follow-up. Open PILS to review.',
    fr: 'Un nouveau contact de terrain nécessite un suivi. Ouvrez PILS pour le consulter.',
    mfe: 'Enn nouvo kontak Outreach bezwen swivi. Ouver PILS pou gete.',
  }[locale] || 'A new Outreach contact needs follow-up. Open PILS to review.';
  return { title: 'PILS', body, tag: key, url: `/outreach?uic=${encodeURIComponent(recordId)}` };
}
