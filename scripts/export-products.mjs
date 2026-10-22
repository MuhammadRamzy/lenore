// Writes dist/products-import.sql from the LOCAL database: every product,
// without photos or posters (image_key/poster_key are left empty), with stock
// reset to its imported opening quantity so local test bills are not carried
// over. Only reads the local database; never adds --remote.
//
//   node scripts/export-products.mjs
//   npx wrangler d1 execute lenore-production --remote --env production --file dist/products-import.sql
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const query = (sql) =>
  JSON.parse(
    execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        "lenore-local",
        "--local",
        "--json",
        "--command",
        sql,
      ],
      { encoding: "utf8", maxBuffer: 64 << 20 },
    ),
  )[0].results;

const columns = [
  "id",
  "code",
  "name",
  "category",
  "unit",
  "description",
  "price_paise",
  "stock",
  "low_stock",
  "published",
  "slug",
  "hsn",
  "gst_rate_bp",
  "barcode",
  "reorder_qty",
  "bin",
  "cost_paise",
  "on_website",
  "featured",
];
const products = query(
  `SELECT ${columns.map((c) => `p.${c}`).join(",")},
     (SELECT m.new_stock FROM stock_movements m WHERE m.product_id=p.id
       AND m.reason='Opening stock (import)' ORDER BY m.created_at LIMIT 1) AS opening
   FROM products p ORDER BY p.code`,
);
const lit = (v) =>
  v === null || v === undefined
    ? "NULL"
    : typeof v === "number"
      ? String(v)
      : `'${String(v).replaceAll("'", "''")}'`;

const now = new Date().toISOString();
const lines = [];
for (const p of products) {
  const stock = p.opening ?? p.stock;
  // Products start at 0; the movement below posts the stock (stock_post trigger).
  const row = { ...p, stock: 0 };
  delete row.opening;
  lines.push(
    `INSERT INTO products(${columns.join(",")},revision,last_actor) VALUES(${columns
      .map((c) => lit(row[c]))
      .join(",")},1,'import');`,
  );
  if (stock > 0)
    lines.push(
      `INSERT INTO stock_movements(id,fingerprint,product_id,delta,previous_stock,new_stock,expected_revision,reason,actor,created_at,kind) VALUES(${lit(crypto.randomUUID())},'import',${lit(p.id)},${stock},0,${stock},1,'Opening stock (import)','import',${lit(now)},'receipt');`,
    );
}
mkdirSync("dist", { recursive: true });
writeFileSync("dist/products-import.sql", lines.join("\n") + "\n");
console.log(
  `dist/products-import.sql: ${products.length} products, no images.`,
);
