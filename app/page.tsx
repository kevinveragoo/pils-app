import BreakfastAttendance from "@/components/BreakfastAttendance";
import AppHeader from "@/components/AppHeader";

export default function Home() {
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
