"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { resetUserPasswordAction, updateUserAction } from "@/app/auth-actions";
import { ORGANIZATIONS, USER_ROLES } from "@/lib/auth-types";

type UserDetails = { id: string; name: string; username: string; organization: string; roles: string[]; status: string };

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="auth-button" type="submit" disabled={pending}>{pending ? "Please wait…" : children}</button>;
}

function Result({ state }: { state: { error?: string; success?: string } }) {
  if (state.error) return <p className="auth-message auth-error" role="alert">{state.error}</p>;
  if (state.success) return <p className="auth-message auth-success" role="status">{state.success}</p>;
  return null;
}

export function UserDetailsForm({ user, currentAdminId }: { user: UserDetails; currentAdminId: string }) {
  const [state, action] = useActionState(updateUserAction, {});
  const ownAccount = user.id === currentAdminId;
  return <form action={action} className="auth-form"><input type="hidden" name="userId" value={user.id} /><Result state={state} /><div className="grid gap-4 sm:grid-cols-2"><label>Full name<input name="name" required defaultValue={user.name} /></label><label>Username<input name="username" required defaultValue={user.username} /></label><label>Organisation<select name="organization" defaultValue={user.organization}>{Object.entries(ORGANIZATIONS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><fieldset className="role-fieldset"><legend>Roles</legend><div className="role-options">{Object.entries(USER_ROLES).map(([code, label]) => { const locked = ownAccount && code === "ADMIN"; return <label key={code} className="role-option"><input type="checkbox" name="roles" value={code} defaultChecked={user.roles.includes(code)} disabled={locked} />{label}{locked && <input type="hidden" name="roles" value="ADMIN" />}</label>; })}</div></fieldset><label>Account status<select name="status" defaultValue={user.status} disabled={ownAccount}><option value="PENDING">Pending approval</option><option value="APPROVED">Active</option><option value="REJECTED">Rejected</option><option value="SUSPENDED">Suspended</option></select>{ownAccount && <input type="hidden" name="status" value="APPROVED" />}</label></div><Submit>Save user details</Submit></form>;
}

export function AdminPasswordResetForm({ userId, ownAccount }: { userId: string; ownAccount: boolean }) {
  const [state, action] = useActionState(resetUserPasswordAction, {});
  if (ownAccount) return <p className="text-sm text-muted-foreground">Use Change Password from the navigation to update your own password.</p>;
  return <form action={action} className="auth-form"><input type="hidden" name="userId" value={userId} /><Result state={state} /><label>Temporary password<input name="password" type="password" autoComplete="new-password" minLength={10} required /><span>At least 10 characters with a letter and number.</span></label><label>Confirm temporary password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label><Submit>Reset password</Submit><p className="text-sm text-muted-foreground">This signs the user out everywhere and requires a password change at their next sign-in.</p></form>;
}
