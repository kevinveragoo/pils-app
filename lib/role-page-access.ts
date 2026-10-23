// Elisa Kevin Veragoo + ChatGPT
import { isPilsUser } from "./organization-access";
import type { UserRole } from "@/lib/auth-types";
export const ROLE_PAGE_ACCESS: Record<UserRole, string[]> = {
  OUTREACH_WORKER: ["Outreach Workflow", "Lookup - partial", "Logs", "Notifications", "Change Password"],
  HEALTHCARE_ASSISTANT: ["Outreach Workflow", "Clinic Workflow", "Clinic Queue", "New Clinic Appointment", "Export Index", "Lookup", "Logs", "Notifications", "Change Password"],
  HEALTHCARE_NAVIGATOR: ["Healthcare Navigator Workflow", "Healthcare Navigator Queue", "Lookup - partial", "Logs", "Notifications", "Change Password"],
  FACILITY_STAFF: ["Client Enrollment Workflow", "Clinic Queue", "Breakfast", "Lookup - partial", "Logs", "Notifications", "Change Password"],
  ADMIN: ["Client Enrollment Workflow", "Outreach Workflow", "Healthcare Navigator Workflow", "Healthcare Navigator Queue", "Clinic Workflow", "Clinic Queue", "New Clinic Appointment", "Export Index", "Breakfast", "Dashboard", "Lookup", "Logs", "Admin Users", "Notifications", "Change Password"],
};

export const EXTERNAL_PAGE_ACCESS = ["Outreach Workflow", "Logs", "Notifications", "Change Password"];
export function pagesForRole(role: UserRole, organization: string) {
  return isPilsUser({ organization }) ? ROLE_PAGE_ACCESS[role] : EXTERNAL_PAGE_ACCESS;
}
