export type AuthActionState = {
  error?: string;
  success?: string;
  fields?: { name?: string; username?: string; organization?: string; requestedRole?: string };
};

export type AdminActionState = { error?: string; success?: string };

export const ORGANIZATIONS = {
  PILS: "PILS",
  CUT: "CUT",
  AILES: "AILES",
  PILS_VOLUNTEER: "PILS Volunteer",
} as const;

export type Organization = keyof typeof ORGANIZATIONS;

export const USER_ROLES = {
  OUTREACH_WORKER: "Outreach Worker",
  HEALTHCARE_ASSISTANT: "Healthcare Assistant",
  HEALTHCARE_NAVIGATOR: "Healthcare Navigator",
  FACILITY_STAFF: "Facility Staff",
  ADMIN: "Administrator",
} as const;

export type UserRole = keyof typeof USER_ROLES;
