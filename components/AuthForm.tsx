"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AuthActionState } from "@/lib/auth-types";
import { changePasswordAction, loginAction, registerAction } from "@/app/auth-actions";
import { ORGANIZATIONS } from "@/lib/auth-types";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="auth-button" type="submit" disabled={pending}>{pending ? "Please wait…" : children}</button>;
}

function Message({ state }: { state: AuthActionState }) {
  if (state.error) return <p className="auth-message auth-error" role="alert">{state.error}</p>;
  if (state.success) return <p className="auth-message auth-success" role="status">{state.success}</p>;
  return null;
}

export function LoginForm() {
  const [state, action] = useActionState(loginAction, {});
  return <form action={action} className="auth-form"><Message state={state} /><label>Username<input name="username" autoComplete="username" required defaultValue={state.fields?.username} /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label><SubmitButton>Sign in</SubmitButton><p>Need an account? <Link href="/register">Register for access</Link></p></form>;
}

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, {});
  if (state.success) return <div className="auth-form"><Message state={state} /><Link className="auth-button text-center" href="/login">Return to sign in</Link></div>;
  return <form action={action} className="auth-form"><Message state={state} /><label>Full name<input name="name" autoComplete="name" required defaultValue={state.fields?.name} /></label><label>Username<input name="username" autoComplete="username" required defaultValue={state.fields?.username} /></label><label>Organisation<select name="organization" required defaultValue={state.fields?.organization ?? ""}><option value="" disabled>Select an organisation</option>{Object.entries(ORGANIZATIONS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><label>Requested role<select name="requestedRole" required defaultValue={state.fields?.requestedRole ?? ""}><option value="" disabled>Select a role</option><option value="OUTREACH_WORKER">Outreach Worker</option><option value="HEALTHCARE_NAVIGATOR">Healthcare Navigator</option><option value="PROGRAMME_STAFF">Programme Staff</option></select></label><label>Password<input name="password" type="password" autoComplete="new-password" minLength={10} required /><span>At least 10 characters with a letter and number.</span></label><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label><SubmitButton>Submit registration</SubmitButton><p>Already registered? <Link href="/login">Sign in</Link></p></form>;
}

export function ChangePasswordForm({ required }: { required: boolean }) {
  const [state, action] = useActionState(changePasswordAction, {});
  return <form action={action} className="auth-form"><Message state={state} />{required && <p className="auth-message">You must replace the temporary password before continuing.</p>}<label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label><label>New password<input name="password" type="password" autoComplete="new-password" minLength={10} required /><span>At least 10 characters with a letter and number.</span></label><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label><SubmitButton>Change password</SubmitButton></form>;
}
