import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import OutreachWorkflow from "@/components/OutreachWorkflow";

export const metadata: Metadata = {
  title: "Outreach Contact | PILS",
  description: "Guided outreach contact and partner referral entry.",
};

export default function OutreachPage() {
  return (
    <div className="flex flex-1 flex-col">
      <a className="pils-skip-link" href="#outreach">Skip to outreach form</a>
      <AppHeader current="outreach" />
      <main id="outreach" className="w-full flex-1 py-6 sm:py-10">
        <OutreachWorkflow />
      </main>
    </div>
  );
}
