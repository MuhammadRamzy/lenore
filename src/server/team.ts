import { Hono } from "hono";
import { teamInput, teamUpdateInput, type TeamMember } from "../shared";
import { hashPassword } from "./auth";
import type { AppEnv } from "./access";

type MemberRow = {
  id: string;
  name: string;
  phone: string;
  role: "admin" | "sales";
  active: number;
  max_discount_bp: number | null;
  pos_access: number;
  revision: number;
  created_at: string;
  last_active_at: string | null;
  quote_count: number;
};
const member = (r: MemberRow): TeamMember => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  role: r.role,
  active: !!r.active,
  maxDiscountBp: r.max_discount_bp,
  posAccess: !!r.pos_access,
  revision: r.revision,
  createdAt: r.created_at,
  lastActiveAt: r.last_active_at,
  quoteCount: r.quote_count,
});
const SELECT_MEMBER = `SELECT u.id,u.name,u.phone,u.role,u.active,u.max_discount_bp,u.pos_access,u.revision,u.created_at,u.last_active_at,
  (SELECT COUNT(*) FROM quotations q WHERE q.created_by=u.id) AS quote_count FROM staff_users u`;

const routes = new Hono<AppEnv>();
routes.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    `${SELECT_MEMBER} ORDER BY u.active DESC,u.name`,
  ).all<MemberRow>();
  return c.json(rows.results.map(member));
});
routes.post("/", async (c) => {
  const d = teamInput.parse(await c.req.json());
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      "INSERT INTO staff_users(id,name,phone,password_hash,role,max_discount_bp,pos_access) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        d.name,
        d.phone,
        await hashPassword(d.password),
        d.role,
        d.maxDiscountBp,
        +d.posAccess,
      )
      .run();
  } catch (error) {
    if (String(error).includes("staff_users.phone"))
      return c.json(
        { error: "A team member already uses this phone number." },
        409,
      );
    throw error;
  }
  const row = await c.env.DB.prepare(`${SELECT_MEMBER} WHERE u.id=?`)
    .bind(id)
    .first<MemberRow>();
  return c.json(member(row!), 201);
});
routes.put("/:id", async (c) => {
  const d = teamUpdateInput.parse(await c.req.json());
  const id = c.req.param("id");
  const hash = d.password ? await hashPassword(d.password) : null;
  const [updated] = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE staff_users SET name=?,role=?,active=?,max_discount_bp=?,pos_access=?,password_hash=COALESCE(?,password_hash),revision=revision+1
      WHERE id=? AND revision=? RETURNING id`,
    ).bind(
      d.name,
      d.role,
      +d.active,
      d.maxDiscountBp,
      +d.posAccess,
      hash,
      id,
      d.revision,
    ),
    // Deactivation, role or password changes end existing sessions at once.
    c.env.DB.prepare(
      `DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM staff_users WHERE id=? AND revision=?)
      AND (?=0 OR ? IS NOT NULL OR role<>?)`,
    ).bind(id, id, d.revision + 1, +d.active, hash, d.role),
  ]);
  if (!updated.results.length)
    return c.json(
      { error: "This team member changed. Refresh and try again." },
      409,
    );
  const row = await c.env.DB.prepare(`${SELECT_MEMBER} WHERE u.id=?`)
    .bind(id)
    .first<MemberRow>();
  return c.json(member(row!));
});
routes.post("/:id/sign-out", async (c) => {
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id=?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ saved: true });
});
export default routes;
