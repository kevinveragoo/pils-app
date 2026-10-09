import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "pils_session";
const SESSION_LENGTH_MS = 7 * 24 * 60 * 60 * 1000;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LENGTH_MS);
  await db.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || session.user.status !== "APPROVED") return null;
  return session.user;
}

export async function requireUser(options?: { allowPasswordChange?: boolean }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options?.allowPasswordChange) redirect("/change-password");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!hasRole(user, "ADMIN")) redirect("/outreach");
  return user;
}

export async function requireLogsAccess() {
  return requireUser();
}

export function userRoles(user: { role: string; roles?: string | null }) {
  let saved: unknown = [];
  try { saved = JSON.parse(user.roles || "[]"); } catch { /* Fall back to the legacy role. */ }
  return [...new Set([...(Array.isArray(saved) ? saved.filter((role): role is string => typeof role === "string") : []), user.role].filter(Boolean))];
}

export function hasRole(user: { role: string; roles?: string | null }, role: string) {
  const assigned = userRoles(user);
  return assigned.includes("ADMIN") || assigned.includes(role);
}

export function hasAnyRole(user: { role: string; roles?: string | null }, allowed: string[]) {
  const assigned = new Set(userRoles(user));
  return allowed.some(role => assigned.has(role));
}

export function defaultRouteForUser(user: { role: string; roles?: string | null }) {
  if (hasAnyRole(user, ["OUTREACH_WORKER", "HEALTHCARE_ASSISTANT", "ADMIN"])) return "/outreach";
  if (hasRole(user, "HEALTHCARE_NAVIGATOR")) return "/healthcare-nav";
  if (hasRole(user, "FACILITY_STAFF")) return "/breakfast";
  return "/change-password";
}

export async function requireAnyRole(allowed: string[]) {
  const user = await requireUser();
  if (!hasAnyRole(user, allowed)) redirect(defaultRouteForUser(user));
  return user;
}

export async function isAuthenticatedRequest() {
  return Boolean(await getCurrentUser());
}
