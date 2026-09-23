import Image from "next/image";
import Link from "next/link";

export default function AppHeader({ current }: { current: "breakfast" | "outreach" | "healthcare-nav" | "dashboard" }) {
  return (
    <header className="pils-header">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Image src="/pils-logo.svg" alt="PILS" width={1112} height={761} priority className="h-14 w-auto" />
        <nav aria-label="Main navigation" className="pils-nav">
          <Link href="/outreach" aria-current={current === "outreach" ? "page" : undefined}><span>Outreach<br />Workflow</span></Link>
          <Link href="/healthcare-nav" aria-current={current === "healthcare-nav" ? "page" : undefined}><span>Healthcare<br />Navigator</span></Link>
          {/* Temporarily disabled; restore the / Link to re-enable. */}
          <span role="link" aria-disabled="true" className="pils-nav-disabled" title="Breakfast is temporarily unavailable">Breakfast</span>
          {/* Temporarily disabled; restore the /dashboard Link to re-enable. */}
          <span role="link" aria-disabled="true" className="pils-nav-disabled" title="Dashboard is temporarily unavailable">Dashboard</span>
        </nav>
      </div>
    </header>
  );
}
