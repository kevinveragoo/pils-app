//
//  page.tsx
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { LoginForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/outreach");
  return <AuthShell title="Sign in" description="Use your approved PILS account to continue."><LoginForm /></AuthShell>;
}
