import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/app/auth-actions";
import { getCurrentUser, hasAnyRole, hasRole } from "@/lib/auth";
import { LanguagePicker } from "@/components/Localization";

export default async function AppHeader({ current }: { current: "breakfast" | "outreach" | "healthcare-nav" | "prep" | "clinic" | "clinic-queue" | "export-index" | "dashboard" | "logs" }) {
  const user = await getCurrentUser();
  const showOutreach = Boolean(user && hasAnyRole(user, ["OUTREACH_WORKER", "HEALTHCARE_ASSISTANT", "ADMIN"]));
  const showHealthcareNavigator = Boolean(user && hasAnyRole(user, ["HEALTHCARE_NAVIGATOR", "ADMIN"]));
  const showClinicalWorkflows = Boolean(user && hasAnyRole(user, ["HEALTHCARE_ASSISTANT", "ADMIN"]));
  const showBreakfast = Boolean(user && hasAnyRole(user, ["FACILITY_STAFF", "ADMIN"]));
  const showDashboard = Boolean(user && hasRole(user, "ADMIN"));
  const showLogs = Boolean(user);
  return (
    <header className="pils-header">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="pils-brand"><Image src="/pils-logo.svg" alt="PILS" width={1112} height={761} priority className="h-14 w-auto" /><LanguagePicker /></div>
        <nav aria-label="Main navigation" className="pils-nav">
          {showOutreach && <Link href="/outreach" aria-current={current === "outreach" ? "page" : undefined}><span>Outreach<br />Workflow</span></Link>}
          {showHealthcareNavigator && <Link href="/healthcare-nav" aria-current={current === "healthcare-nav" ? "page" : undefined}><span>Healthcare Navigator<br />Workflow</span></Link>}
          {showClinicalWorkflows && <Link href="/clinic" aria-current={current === "clinic" ? "page" : undefined}><span>Clinic<br />Workflow</span></Link>}
          {showClinicalWorkflows && <Link href="/clinic-queue" aria-current={current === "clinic-queue" ? "page" : undefined}><span>Clinic<br />Queue</span></Link>}
          {showClinicalWorkflows && <Link href="/export-index" aria-current={current === "export-index" ? "page" : undefined}><span>Export<br />Index</span></Link>}
          {showBreakfast && <Link href="/breakfast" aria-current={current === "breakfast" ? "page" : undefined}>Breakfast</Link>}
          {showDashboard && <Link href="/dashboard" aria-current={current === "dashboard" ? "page" : undefined}>Dashboard</Link>}
          {showLogs && <Link href="/logs" aria-current={current === "logs" ? "page" : undefined}>Logs</Link>}
          {user && hasRole(user, "ADMIN") && <Link href="/admin/users"><span>Admin<br />Users</span></Link>}
          <Link href="/change-password"><span>Change<br />Password</span></Link>
          <form action={logoutAction}><button type="submit"><span>{user?.name ?? "Account"}<br />Sign out</span></button></form>
        </nav>
      </div>
    </header>
  );
}
