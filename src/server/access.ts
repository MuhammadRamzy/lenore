import { Hono, type Context } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { hashPassword, verifyPassword, sha256, consumeLimit } from "./auth";
import type { AccessMode, CatalogueLevel, Role, SessionInfo } from "../shared";

export type Bindings = {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_USERNAME?: string;
  DEMO_MODE?: string;
  /** Canonical public origin, e.g. https://www.lenoretrading.com */
  SITE_ORIGIN?: string;
};
export type Viewer = {
  role: Role;
  userId: string | null;
  name: string;
  phone: string;
  maxDiscountBp: number | null;
};
export type AppEnv = {
  Bindings: Bindings;
  Variables: { viewer: Viewer | null };
};
export type AppContext = Context<AppEnv>;

// Same format as stored hashes so unknown accounts cost the same time.
const DUMMY_HASH = `pbkdf2$${"0".repeat(32)}$${"0".repeat(64)}`;
const STAFF_HOURS = 12;
const SALES_DAYS = 30;

export const clientIp = (c: AppContext) =>
  c.req.header("CF-Connecting-IP") ?? "local";
function cookie(raw: Request, name: string) {
  return new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(
    raw.headers.get("cookie") ?? "",
  )?.[1];
}
const secure = (c: AppContext) => new URL(c.req.url).protocol === "https:";

/** Resolves the signed-in team member, if any; inactive accounts resolve to null. */
export async function loadViewer(c: AppContext): Promise<Viewer | null> {
  const token = cookie(c.req.raw, "lenore_session");
  if (!token) return null;
  const row = await c.env.DB.prepare(
    `SELECT s.role,s.user_id,u.name,u.phone,u.max_discount_bp,u.last_active_at
    FROM sessions s LEFT JOIN staff_users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND (s.user_id IS NULL OR u.active=1)`,
  )
    .bind(await sha256(token), Date.now())
    .first<{
      role: Role;
      user_id: string | null;
      name: string | null;
      phone: string | null;
      max_discount_bp: number | null;
      last_active_at: string | null;
    }>();
  if (!row) return null;
  if (
    row.user_id &&
    (!row.last_active_at ||
      Date.now() - Date.parse(row.last_active_at) > 5 * 60000)
  )
    c.executionCtx.waitUntil(
      c.env.DB.prepare(
        "UPDATE staff_users SET last_active_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
      )
        .bind(row.user_id)
        .run()
        .catch(() => undefined),
    );
  return {
    role: row.role,
    userId: row.user_id,
    name: row.name ?? "Owner",
    phone: row.phone ?? "",
    maxDiscountBp: row.max_discount_bp,
  };
}
export const isAdmin = (v: Viewer | null | undefined) =>
  v?.role === "owner" || v?.role === "admin";

type AccessRow = {
  mode: AccessMode;
  password_hash: string | null;
  generation: number;
  revision: number;
};
const readAccess = (db: D1Database) =>
  db
    .prepare(
      "SELECT mode,password_hash,generation,revision FROM catalogue_access WHERE id=1",
    )
    .first<AccessRow>();

/** Catalogue permission for this request, or null when it must stay locked. */
export async function catalogueLevel(
  c: AppContext,
): Promise<CatalogueLevel | null> {
  if (c.get("viewer")) return "staff";
  const access = await readAccess(c.env.DB);
  if (!access) return null;
  if (access.mode === "public") return "public";
  if (access.mode === "accounts") return null;
  const token = cookie(c.req.raw, "lenore_catalogue");
  if (!token) return null;
  const ok = await c.env.DB.prepare(
    `SELECT 1 FROM catalogue_sessions s JOIN catalogue_access a ON a.id=1 AND s.generation=a.generation
    WHERE token_hash=? AND expires_at>?`,
  )
    .bind(await sha256(token), Date.now())
    .first();
  return ok ? "shared" : null;
}

const routes = new Hono<AppEnv>();

routes.get("/session", (c) => {
  const v = c.get("viewer");
  return c.json<SessionInfo>({
    authenticated: isAdmin(v),
    role: v?.role ?? null,
    name: v?.name ?? "",
    phone: v?.phone ?? "",
    userId: v?.userId ?? null,
    maxDiscountBp: v?.maxDiscountBp ?? null,
  });
});
routes.post("/session", async (c) => {
  const data = z
    .object({
      username: z.string().trim().min(1).max(80),
      password: z.string().min(1).max(256),
    })
    .parse(await c.req.json());
  const ip = clientIp(c);
  const isOwner = data.username === c.env.ADMIN_USERNAME;
  const phone = data.username.replace(/\D/g, "");
  const subject = isOwner ? "owner" : phone || data.username.toLowerCase();
  // Keyed by connection and account: a shared showroom IP cannot lock out the team.
  if (
    !(await consumeLimit(c.env.DB, "login", `${ip}|${subject}`, 10)) ||
    !(await consumeLimit(c.env.DB, "login-ip", ip, 300))
  )
    return c.json(
      { error: "Too many attempts. Try again in 10 minutes." },
      429,
    );
  let session: { role: Role; userId: string | null } | null = null;
  if (isOwner && c.env.ADMIN_PASSWORD_HASH) {
    if (await verifyPassword(data.password, c.env.ADMIN_PASSWORD_HASH))
      session = { role: "owner", userId: null };
  } else {
    const user = /^\d{7,15}$/.test(phone)
      ? await c.env.DB.prepare(
          "SELECT id,role,password_hash FROM staff_users WHERE phone=? AND active=1",
        )
          .bind(phone)
          .first<{
            id: string;
            role: "admin" | "sales";
            password_hash: string;
          }>()
      : null;
    const ok = await verifyPassword(
      data.password,
      user?.password_hash ?? DUMMY_HASH,
    );
    if (user && ok) session = { role: user.role, userId: user.id };
  }
  if (!session)
    return c.json({ error: "Login not recognised. Please try again." }, 401);
  const token = crypto.randomUUID() + crypto.randomUUID();
  const now = Date.now();
  const ttl =
    session.role === "sales" ? SALES_DAYS * 86400000 : STAFF_HOURS * 3600000;
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM rate_limits WHERE key=?").bind(
      `login:${await sha256(`${ip}|${subject}`)}`,
    ),
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(now),
    c.env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<=?").bind(now),
    c.env.DB.prepare(
      "INSERT INTO sessions(token_hash,expires_at,user_id,role) VALUES(?,?,?,?)",
    ).bind(await sha256(token), now + ttl, session.userId, session.role),
  ]);
  setCookie(c, "lenore_session", token, {
    httpOnly: true,
    secure: secure(c),
    sameSite: "Strict",
    path: "/",
    maxAge: ttl / 1000,
  });
  return c.json({
    authenticated: session.role !== "sales",
    role: session.role,
  });
});
routes.delete("/session", async (c) => {
  const token = cookie(c.req.raw, "lenore_session");
  if (token)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await sha256(token))
      .run();
  deleteCookie(c, "lenore_session", { path: "/" });
  return c.json({ authenticated: false });
});

routes.get("/catalogue-access", async (c) => {
  const a = await readAccess(c.env.DB);
  const level = await catalogueLevel(c);
  return c.json({
    mode: a?.mode ?? "accounts",
    protected: a?.mode !== "public",
    authorized: !!level,
    level,
  });
});
routes.post("/catalogue-access", async (c) => {
  const { password } = z
    .object({ password: z.string().min(1).max(128) })
    .strict()
    .parse(await c.req.json());
  const ip = clientIp(c);
  if (!(await consumeLimit(c.env.DB, "catalogue-login", ip, 30)))
    return c.json(
      { error: "Too many attempts. Try again in 10 minutes." },
      429,
    );
  const a = await readAccess(c.env.DB);
  if (!a) return c.json({ error: "Catalogue access is unavailable." }, 503);
  if (a.mode === "public") return c.json({ authorized: true });
  if (a.mode === "accounts")
    return c.json(
      { error: "Sign in with your salesperson account to open the catalogue." },
      403,
    );
  if (!(await verifyPassword(password, a.password_hash ?? undefined)))
    return c.json({ error: "Catalogue password not recognised." }, 401);
  const token = crypto.randomUUID() + crypto.randomUUID();
  const row = await c.env.DB.prepare(
    `INSERT INTO catalogue_sessions(token_hash,generation,expires_at)
    SELECT ?,generation,? FROM catalogue_access WHERE id=1 AND mode='password' AND generation=? AND password_hash=? RETURNING token_hash`,
  )
    .bind(
      await sha256(token),
      Date.now() + 7 * 86400000,
      a.generation,
      a.password_hash,
    )
    .first();
  if (!row)
    return c.json(
      { error: "Catalogue access changed. Try the current password." },
      409,
    );
  await c.env.DB.prepare("DELETE FROM catalogue_sessions WHERE expires_at<=?")
    .bind(Date.now())
    .run();
  setCookie(c, "lenore_catalogue", token, {
    httpOnly: true,
    secure: secure(c),
    sameSite: "Strict",
    path: "/",
    maxAge: 7 * 86400,
  });
  return c.json({ authorized: true });
});
routes.delete("/catalogue-access", async (c) => {
  const token = cookie(c.req.raw, "lenore_catalogue");
  if (token)
    await c.env.DB.prepare("DELETE FROM catalogue_sessions WHERE token_hash=?")
      .bind(await sha256(token))
      .run();
  deleteCookie(c, "lenore_catalogue", { path: "/" });
  return c.json({ authorized: false });
});

const accessState = (r: AccessRow) => ({
  mode: r.mode,
  hasPassword: !!r.password_hash,
  revision: r.revision,
});
routes.get("/admin/catalogue-access", async (c) => {
  const a = await readAccess(c.env.DB);
  return a
    ? c.json(accessState(a))
    : c.json({ error: "Catalogue settings unavailable." }, 503);
});
routes.put("/admin/catalogue-access", async (c) => {
  const d = z
    .object({
      mode: z.enum(["public", "password", "accounts"]),
      password: z.string().max(128).optional(),
      revision: z.number().int().positive(),
    })
    .strict()
    .parse(await c.req.json());
  if (d.password && d.password.length < 6)
    return c.json(
      { error: "Use a catalogue password of at least 6 characters." },
      400,
    );
  const old = await readAccess(c.env.DB);
  if (!old) return c.json({ error: "Catalogue settings unavailable." }, 503);
  const hash = d.password ? await hashPassword(d.password) : old.password_hash;
  if (d.mode === "password" && !hash)
    return c.json(
      { error: "Set a catalogue password before enabling password access." },
      400,
    );
  const row = await c.env.DB.prepare(
    `UPDATE catalogue_access SET mode=?,enabled=?,password_hash=?,generation=generation+1,revision=revision+1
    WHERE id=1 AND revision=? RETURNING mode,password_hash,generation,revision`,
  )
    .bind(d.mode, +(d.mode === "password"), hash, d.revision)
    .first<AccessRow>();
  if (!row)
    return c.json(
      { error: "Catalogue settings changed. Refresh and try again." },
      409,
    );
  await c.env.DB.prepare("DELETE FROM catalogue_sessions WHERE generation<>?")
    .bind(row.generation)
    .run();
  return c.json(accessState(row));
});
routes.post("/admin/catalogue-access/revoke", async (c) => {
  const { revision } = z
    .object({ revision: z.number().int().positive() })
    .strict()
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "UPDATE catalogue_access SET generation=generation+1,revision=revision+1 WHERE id=1 AND revision=? RETURNING mode,password_hash,generation,revision",
  )
    .bind(revision)
    .first<AccessRow>();
  if (!row)
    return c.json(
      { error: "Catalogue settings changed. Refresh and try again." },
      409,
    );
  await c.env.DB.prepare("DELETE FROM catalogue_sessions WHERE generation<>?")
    .bind(row.generation)
    .run();
  return c.json(accessState(row));
});
export default routes;
