import { redirect } from "next/navigation";
import { requireAnyRole } from "@/lib/auth";

export default async function LegacyPrepPage({ searchParams }: { searchParams: Promise<{ uic?: string; queueId?: string; new?: string }> }) {
  await requireAnyRole(["HEALTHCARE_ASSISTANT", "ADMIN"]);
  const query = await searchParams;
  const target = new URLSearchParams({ reason: "7" });
  if (query.uic) target.set("uic", query.uic);
  if (query.queueId) target.set("queueId", query.queueId);
  if (query.new === "1") target.set("new", "1");
  redirect(`/clinic?${target.toString()}`);
}
