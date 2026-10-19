// Prints a PBKDF2 hash for ADMIN_PASSWORD_HASH. The password is read from
// standard input so it never appears in shell history or process lists.
import { pbkdf2Sync, randomBytes } from "node:crypto";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
const password = input.replace(/\r?\n$/, "");
if (password.length < 12) {
  console.error("Use an owner password of at least 12 characters.");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
console.log(`pbkdf2$${salt}$${hash}`);
