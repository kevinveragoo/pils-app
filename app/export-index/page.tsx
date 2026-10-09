import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import { requireAnyRole } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Export Index | PILS",
  description: "Export Index for clinic services.",
};

export default async function ExportIndexPage() {
  await requireAnyRole(["HEALTHCARE_ASSISTANT", "ADMIN"]);

  return (
    <div className="flex flex-1 flex-col">
      <a className="pils-skip-link" href="#export-index">Skip to Export Index</a>
      <AppHeader current="export-index" />
      <main id="export-index" className="w-full flex-1 py-6 sm:py-10">
        <div className="outreach-page mx-auto w-full max-w-4xl px-4 sm:px-6">
          <section className="outreach-card py-12 text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-primary">Clinic services</p>
            <h1 className="mt-2 text-3xl font-bold">Export Index</h1>
            <p className="mt-3 text-muted-foreground">To be implemented.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
