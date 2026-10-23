import { isPilsUser } from "./organization-access";
import type { UserRole } from "@/lib/auth-types";
export const ROLE_PAGE_ACCESS: Record<UserRole, string[]> = {
  OUTREACH_WORKER: ["Outreach Workflow", "Lookup - partial", "Logs", "Change Password"],
  HEALTHCARE_ASSISTANT: ["Outreach Workflow", "Clinic Workflow", "Clinic Queue", "New Clinic Appointment", "Export Index", "Lookup", "Logs", "Change Password"],
  HEALTHCARE_NAVIGATOR: ["Healthcare Navigator Workflow", "Healthcare Navigator Queue", "Lookup - partial", "Logs", "Change Password"],
  FACILITY_STAFF: ["Client Enrollment Workflow", "Clinic Queue", "Breakfast", "Lookup - partial", "Logs", "Change Password"],
  ADMIN: ["Client Enrollment Workflow", "Outreach Workflow", "Healthcare Navigator Workflow", "Healthcare Navigator Queue", "Clinic Workflow", "Clinic Queue", "New Clinic Appointment", "Export Index", "Breakfast", "Dashboard", "Lookup", "Logs", "Admin Users", "Change Password"],
};

export const EXTERNAL_PAGE_ACCESS = ["Outreach Workflow", "Logs", "Change Password"];
export function pagesForRole(role: UserRole, organization: string) {
  return isPilsUser({ organization }) ? ROLE_PAGE_ACCESS[role] : EXTERNAL_PAGE_ACCESS;
}
