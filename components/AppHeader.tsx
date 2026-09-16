import Image from "next/image";
import Link from "next/link";

export default function AppHeader({ current }: { current: "breakfast" | "enrollment" | "outreach" | "healthcare-nav" | "dashboard" }) {
  return (
    <header className="pils-header">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Image src="/pils-logo.svg" alt="PILS" width={1112} height={761} priority className="h-14 w-auto" />
        <nav aria-label="Main navigation" className="pils-nav">
          <Link href="/enrollment" aria-current={current === "enrollment" ? "page" : undefined}>Client enrolment</Link>
          <Link href="/outreach" aria-current={current === "outreach" ? "page" : undefined}>Outreach Workflow</Link>
          <Link href="/healthcare-nav" aria-current={current === "healthcare-nav" ? "page" : undefined}>Healthcare Nav</Link>
          <Link href="/" aria-current={current === "breakfast" ? "page" : undefined}>Breakfast</Link>
          <Link href="/dashboard" aria-current={current === "dashboard" ? "page" : undefined}>Dashboard</Link>
        </nav>
      </div>
    </header>
  );
}
