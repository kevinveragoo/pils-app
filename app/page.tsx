//
//  page.tsx
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import { redirect } from "next/navigation";
import { defaultRouteForUser, requireUser } from "@/lib/auth";

export default async function Home() {
  const user = await requireUser();
  redirect(defaultRouteForUser(user));
}
