import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await derive(password, salt);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, hash] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !/^[a-f0-9]{128}$/.test(hash ?? "")) return false;
  const derived = await derive(password, salt);
  return timingSafeEqual(derived, Buffer.from(hash, "hex"));
}
