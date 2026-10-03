import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPasswordResetForm, UserDetailsForm } from "@/components/AdminUserForms";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function ManageUserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, username: true, organization: true, role: true, status: true } });
  if (!user) notFound();
  return <main className="admin-page"><div className="admin-heading"><div><p className="pils-eyebrow inline-block">Administration</p><h1>Manage user</h1><p>Edit account details or issue a temporary password.</p></div><Link className="auth-button auth-button-secondary" href="/admin/users">Back to users</Link></div><section className="admin-card"><h2>User details</h2><UserDetailsForm user={user} currentAdminId={admin.id} /></section><section className="admin-card"><h2>Reset password</h2><AdminPasswordResetForm userId={user.id} ownAccount={user.id === admin.id} /></section></main>;
}
