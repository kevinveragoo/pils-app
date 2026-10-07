import { closeSync, copyFileSync, existsSync, openSync } from "node:fs";
import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args, label, failureHint = "") {
  console.log(`\n==> ${label}`);
  const result = spawnSync(npm, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    if (failureHint) console.error(`\n${failureHint}`);
    process.exit(result.status ?? 1);
  }
}

console.log("Preparing PILS for local development...");
const skipInstall = process.argv.includes("--skip-install");

if (process.platform === "win32" && existsSync(".next/dev/lock")) {
  try {
    closeSync(openSync(".next/dev/lock", "r+"));
  } catch (error) {
    if (["EACCES", "EBUSY", "EPERM"].includes(error.code)) {
      console.error("A PILS development server is running. Stop it before running npm run setup:local.");
      process.exit(1);
    }
    throw error;
  }
}

if (!existsSync(".env.local")) {
  copyFileSync(".env.example", ".env.local");
  console.log("Created .env.local from .env.example.");
} else {
  console.log("Keeping the existing .env.local file.");
}

if (skipInstall) {
  console.log("Skipping dependency installation (--skip-install).");
} else {
  run(
    ["ci"],
    "Installing locked dependencies",
    "If npm reports EPERM on Windows, stop every running PILS development server and run npm run setup:local again.",
  );
}
run(["run", "db:generate"], "Generating Prisma Client");
run(["run", "db:migrate"], "Applying local database migrations");
run(["run", "db:seed"], "Seeding the local database");

console.log("\nLocal setup complete.");
console.log("1. Add the REDCap URL and token to .env.local.");
console.log("2. Run: npm run dev");
console.log("3. Sign in with kevin / admin and change the temporary password.");
