import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { pbkdf2Sync } from "node:crypto";

const salt = "00000000000000000000000000000000";
const hash = pbkdf2Sync(
  "test-password-only",
  salt,
  100000,
  32,
  "sha256",
).toString("hex");
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          ADMIN_USERNAME: "owner",
          ADMIN_PASSWORD_HASH: `pbkdf2$${salt}$${hash}`,
          DEMO_MODE: "false",
        },
      },
    }),
  ],
  test: { include: ["tests/api.test.ts"], fileParallelism: false },
});
