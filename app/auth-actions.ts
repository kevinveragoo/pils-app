"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSession, deleteCurrentSession, requireAdmin, requireUser } from "@/lib/auth";
import { AdminActionState, AuthActionState, ORGANIZATIONS, Organization, USER_ROLES, UserRole } from "@/lib/auth-types";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

const registrationRoles = new Set<UserRole>(["OUTREACH_WORKER", "HEALTHCARE_NAVIGATOR", "PROGRAMME_STAFF"]);
const allRoles = new Set<UserRole>(Object.keys(USER_ROLES) as UserRole[]);
const organizations = new Set<Organization>(Object.keys(ORGANIZATIONS) as Organization[]);
const dummyHash = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function validPassword(password: string) {
  return password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export async function loginAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const username = value(formData, "username").toLowerCase();
  const password = value(formData, "password");
  if (!username || !password) return { error: "Enter your username and password.", fields: { username } };

  const user = await db.user.findUnique({ where: { username } });
  const matches = await verifyPassword(password, user?.passwordHash ?? dummyHash);
  if (!user || !matches) return { error: "The username or password is incorrect.", fields: { username } };
  if (user.status === "PENDING") return { error: "Your account is awaiting administrator approval.", fields: { username } };
  if (user.status !== "APPROVED") return { error: "This account is not active. Contact an administrator.", fields: { username } };

  await createSession(user.id);
  await db.auditLog.create({ data: { actorId: user.id, event: "LOGIN", targetUserId: user.id } });
  redirect(user.mustChangePassword ? "/change-password" : "/outreach");
}

export async function registerAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const name = value(formData, "name");
  const username = value(formData, "username").toLowerCase();
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");
  const organization = value(formData, "organization") as Organization;
  const requestedRole = value(formData, "requestedRole") as UserRole;
  const fields = { name, username, organization, requestedRole };

  if (name.length < 2) return { error: "Enter your full name.", fields };
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { error: "Username must be 3–40 characters using letters, numbers, dots, hyphens, or underscores.", fields };
  if (!organizations.has(organization)) return { error: "Select a valid organisation.", fields };
  if (!registrationRoles.has(requestedRole)) return { error: "Select a valid role.", fields };
  if (!validPassword(password)) return { error: "Password must be at least 10 characters and contain a letter and a number.", fields };
  if (password !== confirmPassword) return { error: "The passwords do not match.", fields };

  try {
    const user = await db.user.create({
      data: { name, username, organization, passwordHash: await hashPassword(password), role: requestedRole, requestedRole, status: "PENDING" },
    });
    await db.auditLog.create({ data: { event: "REGISTRATION_REQUESTED", targetUserId: user.id } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { error: "That username is already registered.", fields };
    throw error;
  }
  return { success: "Registration submitted. An administrator must approve your account before you can sign in." };
}

export async function changePasswordAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const user = await requireUser({ allowPasswordChange: true });
  const currentPassword = value(formData, "currentPassword");
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");
  if (!await verifyPassword(currentPassword, user.passwordHash)) return { error: "Your current password is incorrect." };
  if (!validPassword(password)) return { error: "New password must be at least 10 characters and contain a letter and a number." };
  if (password !== confirmPassword) return { error: "The new passwords do not match." };
  if (await verifyPassword(password, user.passwordHash)) return { error: "Choose a password different from your current password." };

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: false } }),
    db.session.deleteMany({ where: { userId: user.id } }),
    db.auditLog.create({ data: { actorId: user.id, event: "PASSWORD_CHANGED", targetUserId: user.id } }),
  ]);
  await deleteCurrentSession();
  await createSession(user.id);
  redirect("/outreach");
}

export async function logoutAction() {
  const user = await requireUser({ allowPasswordChange: true });
  await deleteCurrentSession();
  await db.auditLog.create({ data: { actorId: user.id, event: "LOGOUT", targetUserId: user.id } });
  redirect("/login");
}

export async function approveUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = value(formData, "userId");
  const role = value(formData, "role") as UserRole;
  if (!userId || !allRoles.has(role)) return;
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.status !== "PENDING") return;
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { role, status: "APPROVED", approvedAt: new Date(), approvedById: admin.id } }),
    db.auditLog.create({ data: { actorId: admin.id, event: "USER_APPROVED", targetUserId: userId, details: JSON.stringify({ role }) } }),
  ]);
  revalidatePath("/admin/users");
}

export async function rejectUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = value(formData, "userId");
  if (!userId) return;
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.status !== "PENDING") return;
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { status: "REJECTED" } }),
    db.auditLog.create({ data: { actorId: admin.id, event: "USER_REJECTED", targetUserId: userId } }),
  ]);
  revalidatePath("/admin/users");
}

export async function updateUserAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const userId = value(formData, "userId");
  const name = value(formData, "name");
  const username = value(formData, "username").toLowerCase();
  const organization = value(formData, "organization") as Organization;
  const role = value(formData, "role") as UserRole;
  const status = value(formData, "status");
  if (!userId || name.length < 2) return { error: "Enter the user’s full name." };
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { error: "Username must be 3–40 characters using letters, numbers, dots, hyphens, or underscores." };
  if (!organizations.has(organization) || !allRoles.has(role)) return { error: "Select valid organisation and role values." };
  if (!new Set(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).has(status)) return { error: "Select a valid account status." };
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User not found." };
  if (target.id === admin.id && (role !== "ADMIN" || status !== "APPROVED")) return { error: "You cannot remove your own administrator access or suspend your own account." };
  try {
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { name, username, organization, role, status, ...(status === "APPROVED" ? { approvedAt: target.approvedAt ?? new Date(), approvedById: target.approvedById ?? admin.id } : {}) } }),
      ...(status === "APPROVED" ? [] : [db.session.deleteMany({ where: { userId } })]),
      db.auditLog.create({ data: { actorId: admin.id, event: "USER_UPDATED", targetUserId: userId, details: JSON.stringify({ name, username, organization, role, status }) } }),
    ]);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { error: "That username is already in use." };
    throw error;
  }
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { success: "User details updated." };
}

export async function resetUserPasswordAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const userId = value(formData, "userId");
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");
  if (!userId) return { error: "User not found." };
  if (userId === admin.id) return { error: "Use the Change Password page to change your own password." };
  if (!validPassword(password)) return { error: "Temporary password must be at least 10 characters and contain a letter and a number." };
  if (password !== confirmPassword) return { error: "The temporary passwords do not match." };
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User not found." };
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password), mustChangePassword: true } }),
    db.session.deleteMany({ where: { userId } }),
    db.auditLog.create({ data: { actorId: admin.id, event: "PASSWORD_RESET_BY_ADMIN", targetUserId: userId } }),
  ]);
  return { success: "Temporary password set. The user must change it at their next sign-in." };
}
