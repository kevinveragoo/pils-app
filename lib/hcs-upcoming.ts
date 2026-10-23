//
//  hcs-upcoming.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 21/10/2026.
//
export type HcsRow = Record<string, string>;
export type UpcomingHcs = {
  id: string;
  uic: string;
  firstName: string;
  surname: string;
  alias: string;
  followupDate: string;
  notes: string;
  navigator: string;
  driver: string;
  lastVisit: string;
};

export function mauritiusDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function upcomingHcs(rows: HcsRow[], today: string): UpcomingHcs[] {
  const identities = new Map(rows.filter(row => !row.redcap_repeat_instrument && !row.redcap_repeat_instance).map(row => [row.uic_ori, row]));
  const contacts = rows.filter(row => row.uic_ori && row.redcap_repeat_instrument === "hiv_care_support" && row.hcs_status_only !== "1");
  return contacts
    .filter(row => validDate(row.hcs_followup_date ?? "") && row.hcs_followup_date > today)
    .map(row => {
      const identity = identities.get(row.uic_ori) ?? {};
      return {
        id: `${row.uic_ori}:${row.redcap_repeat_instance}`,
        uic: row.uic_ori,
        firstName: identity.ce_first_name ?? "",
        surname: identity.ce_last_name ?? "",
        alias: identity.ce_alias ?? "",
        followupDate: row.hcs_followup_date,
        notes: row.hcs_notes ?? "",
        navigator: [row.hcs_navigator_1, row.hcs_navigator_2].map(name => name?.trim() ?? "").filter(Boolean).join(", "),
        driver: row.hcs_navigator_3 ?? "",
        lastVisit: validDate(row.hcs_date ?? "") ? row.hcs_date : "",
      };
    })
    .sort((a, b) => a.followupDate.localeCompare(b.followupDate) || a.surname.localeCompare(b.surname) || a.uic.localeCompare(b.uic) || a.id.localeCompare(b.id));
}
