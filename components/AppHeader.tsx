//
//  AppHeader.tsx
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 09/10/2026.
//
import { isPilsUser } from "@/lib/organization-access";
import LogoCelebration from "@/components/LogoCelebration";
import HeaderNavigation from "@/components/HeaderNavigation";
import { appointmentRoles } from "@/lib/clinic-appointments";
import Link from "next/link";
import { logoutAction } from "@/app/auth-actions";
import { getCurrentUser, hasAnyRole, hasRole } from "@/lib/auth";
import { LanguagePicker } from "@/components/Localization";

export default async function AppHeader({ current }: { current: "notifications" | "new-appointment" | "hcs-upcoming" | "client-enrollment" | "lookup" | "breakfast" | "outreach" | "healthcare-nav" | "prep" | "clinic" | "clinic-queue" | "dashboard" | "logs" }) {
  const user = await getCurrentUser();
  const showOutreach = Boolean(user && hasAnyRole(user, ["OUTREACH_WORKER", "HEALTHCARE_ASSISTANT", "ADMIN"]));
  const showHealthcareNavigator = Boolean(user && hasAnyRole(user, ["HEALTHCARE_NAVIGATOR", "ADMIN"]));
  const showClinicalWorkflows = Boolean(user && hasAnyRole(user, ["HEALTHCARE_ASSISTANT", "ADMIN"]));
  const showNewAppointment = Boolean(user && hasAnyRole(user, [...appointmentRoles]));
  const showClinicQueue = Boolean(user && hasAnyRole(user, ["FACILITY_STAFF", "HEALTHCARE_ASSISTANT", "ADMIN"]));
  const showEnrollment = Boolean(user && hasAnyRole(user, ["FACILITY_STAFF", "ADMIN"]));
  const showBreakfast = Boolean(user && hasAnyRole(user, ["FACILITY_STAFF", "ADMIN"]));
  const showDashboard = Boolean(user && hasRole(user, "ADMIN"));
  const showLogs = Boolean(user);
  return (
    <header className="pils-header">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="pils-brand"><LogoCelebration className="h-14 w-auto" /><LanguagePicker /></div>
        <HeaderNavigation key={current}><nav aria-label="Main navigation" className="pils-nav">
          {showEnrollment && <Link href="/client-enrollment" aria-current={current === "client-enrollment" ? "page" : undefined}><span>Client Enrollment<br />Workflow</span></Link>}
          {showOutreach && <Link href="/outreach" aria-current={current === "outreach" ? "page" : undefined}><span>Outreach<br />Workflow</span></Link>}
          {showHealthcareNavigator && <Link href="/healthcare-nav" aria-current={current === "healthcare-nav" ? "page" : undefined}><span>Healthcare Navigator<br />Workflow</span></Link>}
          {showHealthcareNavigator && <Link href="/hiv-care-support-upcoming" aria-current={current === "hcs-upcoming" ? "page" : undefined}><span>Healthcare Navigator<br />Queue</span></Link>}
          {showClinicalWorkflows && <Link href="/clinic" aria-current={current === "clinic" ? "page" : undefined}><span>Clinic<br />Workflow</span></Link>}
          {showNewAppointment && <Link href="/new-appointment" aria-current={current === "new-appointment" ? "page" : undefined}><span>New Clinic<br />Appointment</span></Link>}
          {showClinicQueue && <Link href="/clinic-queue" aria-current={current === "clinic-queue" ? "page" : undefined}><span>Clinic<br />Queue</span></Link>}
          {showBreakfast && <Link href="/breakfast" aria-current={current === "breakfast" ? "page" : undefined}>Breakfast</Link>}
          {showDashboard && <Link href="/dashboard" aria-current={current === "dashboard" ? "page" : undefined}>Dashboard</Link>}
          {user && isPilsUser(user) && <Link href="/lookup" aria-current={current === "lookup" ? "page" : undefined}>Lookup</Link>}
          {showLogs && <Link href="/logs" aria-current={current === "logs" ? "page" : undefined}>Logs</Link>}
          {user && hasRole(user, "ADMIN") && <Link href="/admin/users"><span>Admin<br />Users</span></Link>}
          {user && <Link href="/notifications" aria-current={current === "notifications" ? "page" : undefined}>Notifications</Link>}
          <Link href="/change-password"><span>Change<br />Password</span></Link>
          <form action={logoutAction}><button type="submit"><span>{user?.name ?? "Account"}<br />Sign out</span></button></form>
        </nav></HeaderNavigation>
      </div>
    </header>
  );
}
