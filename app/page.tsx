import { redirect } from "next/navigation";
import { defaultRouteForUser, requireUser } from "@/lib/auth";

export default async function Home() {
  const user = await requireUser();
  redirect(defaultRouteForUser(user));
}
