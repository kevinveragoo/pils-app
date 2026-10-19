import type { UserRole } from "@/lib/auth-types";
export const ROLE_PAGE_ACCESS: Record<UserRole, string[]> = {
  OUTREACH_WORKER: ["Outreach Workflow", "Lookup - partial", "Logs", "Change Password"],
  HEALTHCARE_ASSISTANT: ["Outreach Workflow", "Clinic Workflow", "Clinic Queue", "Export Index", "Lookup", "Logs", "Change Password"],
  HEALTHCARE_NAVIGATOR: ["Healthcare Navigator Workflow", "Lookup", "Logs", "Change Password"],
  FACILITY_STAFF: ["Client Enrollment Workflow", "Clinic Queue", "Breakfast", "Lookup - partial", "Logs", "Change Password"],
  ADMIN: ["Client Enrollment Workflow", "Outreach Workflow", "Healthcare Navigator Workflow", "Clinic Workflow", "Clinic Queue", "Export Index", "Breakfast", "Dashboard", "Lookup", "Logs", "Admin Users", "Change Password"],
};
