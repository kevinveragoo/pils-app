import BreakfastAttendance from "@/components/BreakfastAttendance";
import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <a className="pils-skip-link" href="#attendance">Skip to attendance</a>
      <header className="pils-header">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Image src="/pils-logo.svg" alt="PILS" width={1112} height={761} priority className="h-16 w-auto" />
          <span className="pils-eyebrow">Breakfast attendance</span>
        </div>
      </header>
      <main id="attendance" className="w-full flex-1 py-6 sm:py-10">
        <BreakfastAttendance />
      </main>
    </div>
  );
}
