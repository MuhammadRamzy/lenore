import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./access";

const routes = new Hono<AppEnv>();

/** Dashboard figures for the last N days (India time boundaries are approximated in UTC). */
routes.get("/analytics", async (c) => {
  const days = z.coerce
    .number()
    .int()
    .refine((d) => [7, 30, 90, 365].includes(d))
    .catch(30)
    .parse(c.req.query("days"));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const sinceDay = since.slice(0, 10);
  const db = c.env.DB;
  const [totals, byStatus, byPerson, daily, topQuoted, views, stock, team] =
    await db.batch([
      db
        .prepare(
          `SELECT COUNT(*) AS quotes, COALESCE(SUM(total_paise),0) AS value,
          SUM(status='won') AS won, COALESCE(SUM(CASE WHEN status='won' THEN total_paise END),0) AS wonValue,
          SUM(total_paise IS NULL) AS unpriced
          FROM quotations WHERE created_at>=?`,
        )
        .bind(since),
      db
        .prepare(
          "SELECT status, COUNT(*) AS n FROM quotations WHERE created_at>=? GROUP BY status",
        )
        .bind(since),
      db
        .prepare(
          `SELECT COALESCE(created_by,'') AS id, created_by_name AS name, COUNT(*) AS quotes,
          COALESCE(SUM(total_paise),0) AS value, SUM(status='won') AS won
          FROM quotations WHERE created_at>=? GROUP BY created_by, created_by_name ORDER BY quotes DESC LIMIT 50`,
        )
        .bind(since),
      db
        .prepare(
          `SELECT substr(created_at,1,10) AS day, COUNT(*) AS quotes, COALESCE(SUM(total_paise),0) AS value
          FROM quotations WHERE created_at>=? GROUP BY day ORDER BY day`,
        )
        .bind(since),
      db
        .prepare(
          `SELECT json_extract(j.value,'$.productId') AS productId, json_extract(j.value,'$.code') AS code,
          json_extract(j.value,'$.name') AS name, COUNT(*) AS quotes, SUM(json_extract(j.value,'$.quantity')) AS quantity
          FROM quotations q, json_each(q.items_json) j WHERE q.created_at>=?
          GROUP BY productId ORDER BY quotes DESC, quantity DESC LIMIT 10`,
        )
        .bind(since),
      db
        .prepare(
          `SELECT v.product_id AS productId, p.code, p.name, SUM(v.views) AS views
          FROM product_views v JOIN products p ON p.id=v.product_id WHERE v.day>=?
          GROUP BY v.product_id ORDER BY views DESC LIMIT 10`,
        )
        .bind(sinceDay),
      db.prepare(
        `SELECT SUM(stock=0) AS out, SUM(stock>0 AND stock<=low_stock) AS low,
        SUM(image_key IS NULL) AS noPhoto, SUM(price_paise IS NULL) AS noPrice,
        COALESCE(SUM(CASE WHEN cost_paise IS NOT NULL THEN cost_paise*stock END),0) AS costValue,
        COALESCE(SUM(CASE WHEN price_paise IS NOT NULL THEN price_paise*stock END),0) AS mrpValue,
        SUM(cost_paise IS NULL AND stock>0) AS uncosted, COUNT(*) AS products
        FROM products`,
      ),
      db
        .prepare(
          `SELECT COUNT(*) AS members, SUM(active) AS active,
          SUM(active=1 AND last_active_at>=?) AS activeToday FROM staff_users`,
        )
        .bind(new Date(Date.now() - 86400000).toISOString()),
    ]);
  const viewTotal = await db
    .prepare(
      "SELECT COALESCE(SUM(views),0) AS n FROM product_views WHERE day>=?",
    )
    .bind(sinceDay)
    .first<{ n: number }>();
  return c.json({
    days,
    totals: totals.results[0],
    byStatus: byStatus.results,
    byPerson: byPerson.results,
    daily: daily.results,
    topQuoted: topQuoted.results,
    topViewed: views.results,
    views: viewTotal?.n ?? 0,
    stock: stock.results[0],
    team: team.results[0],
  });
});

routes.get("/activity", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT a.id, a.product_id AS productId,a.actor,a.action,a.detail,a.created_at AS createdAt,a.reason
    FROM activity a ORDER BY a.id DESC LIMIT 100`,
  ).all();
  return c.json(rows.results);
});
export default routes;
