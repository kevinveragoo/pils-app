import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);

await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}

const existing = await prisma.user.findUnique({ where: { username: "kevin" } });

if (!existing) {
  const admin = await prisma.user.create({
    data: {
      username: "kevin",
      name: "Kevin",
      organization: "PILS",
      passwordHash: await hashPassword("admin"),
      role: "ADMIN",
      roles: JSON.stringify(["ADMIN"]),
      requestedRole: "ADMIN",
      status: "APPROVED",
      mustChangePassword: true,
      approvedAt: new Date(),
    },
  });
  await prisma.auditLog.create({ data: { actorId: admin.id, event: "INITIAL_ADMIN_CREATED", targetUserId: admin.id } });
  console.log("Created initial administrator: kevin");
} else {
  console.log("Initial administrator already exists; no password or account data changed.");
}

await prisma.$disconnect();
