import BreakfastAttendance from "@/components/BreakfastAttendance";
import AppHeader from "@/components/AppHeader";
import { requireAnyRole } from "@/lib/auth";

export default async function BreakfastPage() {
  await requireAnyRole(["FACILITY_STAFF", "ADMIN"]);
  return (
    <div className="flex flex-1 flex-col">
      <a className="pils-skip-link" href="#attendance">Skip to attendance</a>
      <AppHeader current="breakfast" />
      <main id="attendance" className="w-full flex-1 py-6 sm:py-10">
        <BreakfastAttendance />
      </main>
    </div>
  );
}
