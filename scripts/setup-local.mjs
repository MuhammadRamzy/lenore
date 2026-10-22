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
// Browser tests pass --persist-to to get their own database, so they never
// touch the products you work with locally.
const at = process.argv.indexOf("--persist-to");
const persist = at > 0 ? ["--persist-to", process.argv[at + 1]] : [];
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
  [
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "lenore-local",
    "--local",
    ...persist,
  ],
  { stdio: "inherit" },
);
// Sample products only go into an empty database, so real or imported
// products are never mixed with them (and deleted samples stay deleted).
const [{ results }] = JSON.parse(
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "lenore-local",
      "--local",
      "--json",
      ...persist,
      "--command",
      "SELECT COUNT(*) AS n FROM products",
    ],
    { encoding: "utf8" },
  ),
);
if (results[0].n > 0) {
  console.log(
    "Local setup ready (existing products kept, no samples added). Start with npm run dev.",
  );
  process.exit(0);
}
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
    ...persist,
    "--file",
    "scripts/seed-local.sql",
  ],
  { stdio: "inherit" },
);
console.log(
  "Local setup ready. Sign-in details are in the ignored local-access.txt file. Start with npm run dev.",
);
