//
//  page.tsx
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import RecordLookup from "@/components/RecordLookup";
import { requirePilsUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Lookup | PILS", description: "Read-only client record lookup." };

export default async function LookupPage() {
  await requirePilsUser();
  return <div className="flex flex-1 flex-col">
    <a className="pils-skip-link" href="#lookup">Skip to Lookup</a>
    <AppHeader current="lookup" />
    <main id="lookup" className="w-full flex-1 py-6 sm:py-10"><RecordLookup /></main>
  </div>;
}
