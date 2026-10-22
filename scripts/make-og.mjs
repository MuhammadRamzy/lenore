// Renders public/images/og-lenore.jpg (1200×630), the default link preview,
// from the stacked logo and three product photos.
//
//   node scripts/make-og.mjs big.webp small-1.webp small-2.webp
import { chromium } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const photos = process.argv.slice(2, 5);
if (photos.length !== 3) {
  console.error("Pass three product photos: one large, two small.");
  process.exit(1);
}
const data = (file, type) =>
  `data:${type};base64,${readFileSync(file).toString("base64")}`;
const font = (w) =>
  data(
    `node_modules/@fontsource/manrope/files/manrope-latin-${w}-normal.woff2`,
    "font/woff2",
  );
const [big, a, b] = photos.map((p) => data(p, "image/webp"));
const logo = data(
  "public/images/lenore-stacked-full-colour.svg",
  "image/svg+xml",
);

const html = `<!doctype html><html><head><style>
@font-face{font-family:M;font-weight:500;src:url(${font(500)})}
@font-face{font-family:M;font-weight:700;src:url(${font(700)})}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;display:grid;grid-template-columns:1fr 620px;gap:36px;align-items:center;
  padding:48px;background:#f6f5f2;font-family:M;color:#151515}
.copy{height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:4px 0}
.copy img{width:210px}
h1{font-size:42px;font-weight:700;line-height:1.08;letter-spacing:-0.03em}
h1 span{color:#8a5a2b}
p{margin-top:16px;font-size:21px;font-weight:500;line-height:1.45;color:#3b3a37}
.place{font-size:18px;font-weight:700;color:#8a5a2b;letter-spacing:.02em}
/* Square tiles, so photos are never cropped. */
.grid{display:grid;grid-template-columns:410px 200px;grid-template-rows:200px 200px;gap:10px}
.grid div{border-radius:22px;background:#fff center/cover no-repeat;box-shadow:0 8px 24px rgb(20 20 20/.08)}
.grid div:first-child{grid-row:span 2}
</style></head><body>
<div class="copy">
  <img src="${logo}" alt="">
  <div>
    <h1>Bath fittings &amp; sanitary ware, <span>chosen with care.</span></h1>
    <p>Taps, showers, sinks and accessories with GST invoices and quotations on WhatsApp.</p>
  </div>
  <div class="place">Showroom · Kuttiady, Kozhikode</div>
</div>
<div class="grid">
  <div style="background-image:url(${big})"></div>
  <div style="background-image:url(${a})"></div>
  <div style="background-image:url(${b})"></div>
</div>
</body></html>`;

const local = join(
  homedir(),
  ".cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
);
const browser = await chromium.launch(
  existsSync(local) ? { executablePath: local } : {},
);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({
  path: "public/images/og-lenore.jpg",
  type: "jpeg",
  quality: 86,
});
await browser.close();
console.log("public/images/og-lenore.jpg");
