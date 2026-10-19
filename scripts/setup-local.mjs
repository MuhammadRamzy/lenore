import {
  appendFileSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { execFileSync } from "node:child_process";

// Older local setups predate the staff username; add the default once.
if (
  existsSync(".dev.vars") &&
  !readFileSync(".dev.vars", "utf8").includes("ADMIN_USERNAME")
)
  appendFileSync(".dev.vars", `ADMIN_USERNAME="owner"\n`);
// This script only targets Wrangler's local database. Never adds --remote.
if (!existsSync(".dev.vars")) {
  const password = randomBytes(15).toString("base64url");
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
  writeFileSync(
    ".dev.vars",
    `ADMIN_USERNAME="owner"\nADMIN_PASSWORD_HASH="pbkdf2$${salt}$${hash}"\nDEMO_MODE="true"\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    "local-access.txt",
    `Local Lenore workspace only\nURL: http://127.0.0.1:8787/manage\nUsername: owner\nPassword: ${password}\n`,
    { mode: 0o600 },
  );
}
execFileSync(
  "npx",
  ["wrangler", "d1", "migrations", "apply", "lenore-local", "--local"],
  { stdio: "inherit" },
);
const seed = readFileSync("scripts/seed-local.sql", "utf8");
if (!seed.includes("Illustrative"))
  throw new Error("Seed must identify sample records.");
execFileSync(
  "npx",
  [
    "wrangler",
    "d1",
    "execute",
    "lenore-local",
    "--local",
    "--file",
    "scripts/seed-local.sql",
  ],
  { stdio: "inherit" },
);
console.log(
  "Local setup ready. Sign-in details are in the ignored local-access.txt file. Start with npm run dev.",
);
