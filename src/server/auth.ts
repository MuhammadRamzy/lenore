export async function sha256(value: string): Promise<string> {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}
function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function hashPassword(password: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
  return `pbkdf2$${salt}$${hash}`;
}
export async function verifyPassword(
  password: string,
  stored: string | undefined,
) {
  if (!stored) return false;
  const [scheme, salt, expected] = stored.split("$");
  if (
    scheme !== "pbkdf2" ||
    !/^[0-9a-f]{32}$/.test(salt ?? "") ||
    !/^[0-9a-f]{64}$/.test(expected ?? "")
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const result = hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
  let difference = 0;
  for (let i = 0; i < result.length; i++)
    difference |= result.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
export async function consumeLimit(
  db: D1Database,
  scope: string,
  ip: string,
  limit: number,
) {
  const now = Date.now();
  const key = `${scope}:${await sha256(ip)}`;
  const row = await db
    .prepare(
      `INSERT INTO rate_limits(key, attempts, expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
    expires_at = CASE WHEN expires_at <= ? THEN ? ELSE expires_at END RETURNING attempts`,
    )
    .bind(key, now + 600000, now, now, now + 600000)
    .first<{ attempts: number }>();
  return !!row && row.attempts <= limit;
}
