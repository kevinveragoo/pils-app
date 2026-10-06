export type PatientSummaryDetails = { alias?: string; firstName?: string; lastName?: string; phone?: string; uic?: string };

export function PatientSummary({ patient, className = "" }: { patient: PatientSummaryDetails; className?: string }) {
  const fullName = [patient.firstName, patient.lastName].filter(Boolean).join(" ");
  return <div className={`grid items-center gap-3 rounded-2xl bg-secondary p-4 sm:grid-cols-[1fr_3fr] ${className}`} aria-label="Patient details">
    <strong className="text-lg">{patient.alias || patient.firstName || "—"}</strong>
    <span className="grid gap-0.5 text-sm font-semibold">
      <span>{fullName || "—"}{"\u00a0\u00a0"}{patient.phone || "—"}</span>
      {patient.uic && <span className="text-xs font-bold tracking-wide text-primary">{patient.uic}</span>}
    </span>
  </div>;
}
