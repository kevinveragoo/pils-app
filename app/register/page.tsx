import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { RegisterForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/outreach");
  return <AuthShell title="Request an account" description="An administrator will review your details and role before access is enabled."><RegisterForm /></AuthShell>;
}
