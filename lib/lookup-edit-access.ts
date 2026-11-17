import { hasAnyRole, type getCurrentUser } from "@/lib/auth";
import { isPilsUser } from "@/lib/organization-access";
import type { UserRole } from "@/lib/auth-types";
type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
const workflowForms: Partial<Record<UserRole, string[]>> = {
  OUTREACH_WORKER: ["outreach_contact", "risk_assessment", "violence_disclosure"],
  HEALTHCARE_ASSISTANT: ["client_enrollment", "clinic_enrollment", "clinic_visit", "prep_treatment_profile", "prep_visit", "outreach_contact", "risk_assessment", "violence_disclosure", "hiv_treatment_profile", "hiv_clinical_monitoring"],
  HEALTHCARE_NAVIGATOR: ["hiv_care_support", "hiv_treatment_profile", "hiv_clinical_monitoring"],
  FACILITY_STAFF: ["client_enrollment", "breakfast"],
};
export function canEditLookup(user: User, form: string) {
  return isPilsUser(user) && (hasAnyRole(user, ["ADMIN"]) || Object.entries(workflowForms).some(([role, forms]) => forms.includes(form) && hasAnyRole(user, [role as UserRole])));
}
