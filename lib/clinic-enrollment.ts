// Elisa Kevin Veragoo + ChatGPT
import fieldRules from "./redcap-field-rules.json";
export const clinicEnrollmentDefaults = { cne_facility: "Pils Banian" };

export const clinicEnrollmentChoices: Record<string, [string, string][]> = {
  "cne_sti_diagnosed": [["1", "Chlamydia"], ["2", "Gonorrhea"], ["3", "Syphilis"], ["4", "Trichomoniasis"], ["5", "Genital herpes (HSV)"], ["6", "Human papillomavirus (HPV) / genital warts"], ["7", "Mycoplasma genitalium"], ["8", "Chancroid"], ["9", "Lymphogranuloma venereum (LGV)"], ["10", "Donovanosis (granuloma inguinale)"], ["11", "HIV"], ["12", "Hepatitis B"], ["13", "Hepatitis C"], ["14", "Pubic lice"], ["15", "Scabies"], ["16", "Molluscum contagiosum"], ["17", "Hepatitis A"], ["99", "Other"], ["0", "None diagnosed"], ["98", "Unknown"]],
  "cne_violence_perpetrator": [
    [
      "1",
      "Local leader(s)"
    ],
    [
      "2",
      "Police"
    ],
    [
      "3",
      "Military"
    ],
    [
      "4",
      "Security guard(s)"
    ],
    [
      "5",
      "Madam(s)/pimp(s)/bar manager(s)/owner(s)"
    ],
    [
      "6",
      "Local gang(s)"
    ],
    [
      "7",
      "General community"
    ],
    [
      "8",
      "Family member(s)"
    ],
    [
      "9",
      "Regular/past partner"
    ],
    [
      "10",
      "Sex-work client(s)"
    ],
    [
      "11",
      "Health-care facility staff"
    ],
    [
      "99",
      "Other"
    ]
  ],
  "cne_violence_help_source": [
    [
      "1",
      "Medical/hospital"
    ],
    [
      "2",
      "Legal/police"
    ],
    [
      "3",
      "Family"
    ],
    [
      "4",
      "Peers"
    ],
    [
      "5",
      "Friends"
    ],
    [
      "6",
      "Religious leader"
    ],
    [
      "7",
      "Chief/village elder"
    ],
    [
      "8",
      "HIV program"
    ],
    [
      "99",
      "Other"
    ]
  ],
  "cne_hiv_disclosure_recipient": [
    [
      "1",
      "Intimate/regular partner"
    ],
    [
      "2",
      "Regular client"
    ],
    [
      "3",
      "Friend/relative"
    ],
    [
      "99",
      "Other"
    ]
  ]
};

export function clinicFieldVisible(key: string, values: Record<string, string>, sexAssignedBirth: string, kpType = "") {
  const rule = (fieldRules as Record<string, { branch?: string }>)[key];
  const comparison = (rule?.branch??"").match(/^\[([a-zA-Z0-9_]+)\]\s*(=|<>)\s*['"]([^'"]*)['"]$/);
  if (comparison && comparison[1].startsWith("cne_")) {
    const same = (values[comparison[1]] ?? "") === comparison[3];
    if (!(comparison[2] === "=" ? same : !same)) return false;
  }
  if (key === "cne_ref_outreach_worker") return values.cne_outreach_contact === "1";
  if (key === "cne_msm_sex_type") return kpType.split(",").includes("2");
  if (["cne_pregnancies", "cne_pregnant_now", "cne_num_children", "cne_contraception_type"].includes(key)) return sexAssignedBirth === "2";
  if (key === "cne_antenatal") return sexAssignedBirth === "2" && values.cne_pregnant_now === "1";
  if (key.startsWith("cne_violence_perpetrator") || key === "cne_violence_type") {
    if (values.cne_violence_3m !== "1") return false;
  }
  if (key.startsWith("cne_violence_help_source") && (values.cne_violence_3m !== "1" || values.cne_violence_help !== "1")) return false;
  if (key.startsWith("cne_hiv_disclosure_recipient") && (values.cne_hiv_prev_test !== "1" || values.cne_hiv_prev_result !== "1" || values.cne_hiv_prev_result_disclosed !== "1")) return false;
  if (key.endsWith("_other") && clinicEnrollmentChoices[key.slice(0, -6)]) return values[key.slice(0, -6)]?.split(",").includes("99") ?? false;
  return true;
}

export function visibleClinicEnrollment(values: Record<string, string>, sexAssignedBirth: string, kpType = "") {
  return Object.fromEntries(Object.entries(values).filter(([key]) => clinicFieldVisible(key, values, sexAssignedBirth, kpType)));
}

export function clientKpType(record: Record<string, string> | undefined) {
  return record ? [1, 2, 3, 4, 5, 6, 7, 8].filter(code => record[`ce_kp_type___${code}`] === "1").join(",") : "";
}
