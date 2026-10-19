import { Hono } from "hono";
import { z } from "zod";
import type { CatalogueProduct } from "../shared";
import type { AppEnv } from "./access";
import { actorName } from "./products";

export type WebsiteSettings = {
  showProducts: boolean;
  showPrices: boolean;
  showStock: boolean;
  revision: number;
  updatedAt: string;
};
export async function readWebsite(db: D1Database): Promise<WebsiteSettings> {
  const r = await db
    .prepare(
      "SELECT show_products,show_prices,show_stock,revision,updated_at FROM website_settings WHERE id=1",
    )
    .first<{
      show_products: number;
      show_prices: number;
      show_stock: number;
      revision: number;
      updated_at: string;
    }>();
  return {
    showProducts: !!r?.show_products,
    showPrices: !!r?.show_prices,
    showStock: !!r?.show_stock,
    revision: r?.revision ?? 1,
    updatedAt: r?.updated_at ?? "",
  };
}

/** Published products the website may list: shown individually and in a visible category. */
export const ON_WEBSITE = `published=1 AND on_website=1 AND NOT EXISTS (
  SELECT 1 FROM website_categories w WHERE w.hidden=1 AND w.name=products.category)`;

/** Category order and intros set by admins; unlisted categories follow by name. */
export async function categoryLayout(db: D1Database) {
  const rows = await db
    .prepare("SELECT name,hidden,sort_order,intro FROM website_categories")
    .all<{ name: string; hidden: number; sort_order: number; intro: string }>();
  return new Map(rows.results.map((r) => [r.name.toLowerCase(), r]));
}

/** What an anonymous visitor may see of a product under the website switches. */
export const publicView = (
  p: CatalogueProduct,
  site: WebsiteSettings,
): CatalogueProduct => ({
  ...p,
  pricePaise: site.showPrices ? p.pricePaise : null,
  availability: site.showStock ? p.availability : null,
});

const routes = new Hono<AppEnv>();
routes.get("/admin/website", async (c) => {
  const db = c.env.DB;
  const [settings, layout, rows] = await Promise.all([
    readWebsite(db),
    categoryLayout(db),
    db
      .prepare(
        "SELECT id,code,name,category,published,on_website,featured,image_key FROM products ORDER BY category,name LIMIT 5000",
      )
      .all<{
        id: string;
        code: string;
        name: string;
        category: string;
        published: number;
        on_website: number;
        featured: number;
        image_key: string | null;
      }>(),
  ]);
  const names = new Map<string, string>();
  for (const r of rows.results)
    if (!names.has(r.category.toLowerCase()))
      names.set(r.category.toLowerCase(), r.category);
  const categories = [...names]
    .map(([key, name]) => {
      const l = layout.get(key);
      const items = rows.results.filter(
        (r) => r.category.toLowerCase() === key,
      );
      return {
        name,
        hidden: !!l?.hidden,
        sortOrder: l?.sort_order ?? 1000,
        intro: l?.intro ?? "",
        products: items.length,
        onWebsite: items.filter((r) => r.published && r.on_website).length,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return c.json({
    settings,
    categories,
    products: rows.results.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      category: r.category,
      published: !!r.published,
      onWebsite: !!r.on_website,
      featured: !!r.featured,
      hasPhoto: !!r.image_key,
    })),
  });
});
routes.put("/admin/website/settings", async (c) => {
  const d = z
    .object({
      showProducts: z.boolean(),
      showPrices: z.boolean(),
      showStock: z.boolean(),
      revision: z.number().int().positive(),
    })
    .strict()
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    `UPDATE website_settings SET show_products=?,show_prices=?,show_stock=?,revision=revision+1,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1 AND revision=? RETURNING id`,
  )
    .bind(+d.showProducts, +d.showPrices, +d.showStock, d.revision)
    .first();
  if (!row)
    return c.json(
      { error: "Website settings changed. Refresh and try again." },
      409,
    );
  return c.json(await readWebsite(c.env.DB));
});
routes.put("/admin/website/categories", async (c) => {
  const d = z
    .object({
      categories: z
        .array(
          z
            .object({
              name: z.string().trim().min(1).max(80),
              hidden: z.boolean(),
              sortOrder: z.number().int().min(0).max(1000),
              intro: z.string().trim().max(400),
            })
            .strict(),
        )
        .max(300),
    })
    .strict()
    .parse(await c.req.json());
  const db = c.env.DB;
  await db.batch([
    ...d.categories.map((x) =>
      db
        .prepare(
          `INSERT INTO website_categories(name,hidden,sort_order,intro) VALUES(?,?,?,?)
          ON CONFLICT(name) DO UPDATE SET hidden=excluded.hidden,sort_order=excluded.sort_order,intro=excluded.intro`,
        )
        .bind(x.name, +x.hidden, x.sortOrder, x.intro),
    ),
    // Category changes alter public catalogue content, so clients revalidate.
    db.prepare(
      "UPDATE website_settings SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1",
    ),
  ]);
  return c.json(await readWebsite(db));
});
routes.put("/admin/website/products", async (c) => {
  const d = z
    .object({
      ids: z.array(z.string().min(1).max(80)).min(1).max(400),
      onWebsite: z.boolean().optional(),
      featured: z.boolean().optional(),
    })
    .strict()
    .refine((x) => x.onWebsite !== undefined || x.featured !== undefined)
    .parse(await c.req.json());
  const db = c.env.DB;
  if (d.featured) {
    const n = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM products WHERE featured=1 AND id NOT IN (SELECT value FROM json_each(?))`,
      )
      .bind(JSON.stringify(d.ids))
      .first<{ n: number }>();
    if ((n?.n ?? 0) + d.ids.length > 12)
      return c.json(
        { error: "Feature up to 12 products. Remove one before adding more." },
        400,
      );
  }
  const actor = actorName(c.get("viewer"));
  const result = await db
    .prepare(
      `UPDATE products SET on_website=COALESCE(?,on_website),featured=COALESCE(?,featured),
      last_actor=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id IN (SELECT value FROM json_each(?))`,
    )
    .bind(
      d.onWebsite === undefined ? null : +d.onWebsite,
      d.featured === undefined ? null : +d.featured,
      actor,
      JSON.stringify(d.ids),
    )
    .run();
  return c.json({ updated: result.meta.changes });
});
export default routes;
