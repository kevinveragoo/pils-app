//
//  page.tsx
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import AuthShell from "@/components/AuthShell";
import { ChangePasswordForm } from "@/components/AuthForm";
import { requireUser } from "@/lib/auth";

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowPasswordChange: true });
  return <AuthShell title="Change password" description={`Signed in as ${user.name}.`}><ChangePasswordForm required={user.mustChangePassword} /></AuthShell>;
}
