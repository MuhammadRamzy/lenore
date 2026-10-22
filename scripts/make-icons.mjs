// Renders the app icons in public/icons from the Lenore mark, using the
// Playwright Chromium already installed for the browser tests.
//
//   node scripts/make-icons.mjs
import { chromium } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MARK =
  "M0 95.21C43.48 44.11 119.8 0 204.38 0C297.37 0 354.81 46.97 354.81 116.32L354.81 832.43C325.61 814.66 273.88 759.44 273.88 660.43L273.88 235.16C273.88 158.68 223.1 95.21 141.23 95.21L0 95.21ZM171.06 241.51C209.62 264.04 245.64 336.4 245.64 408.44L245.64 688.67C245.64 797.52 335.45 888.92 429.07 888.92L563.16 888.92C652.17 888.92 690.26 772.14 718.97 688.99C723.26 862.58 698.51 1000 621.71 1000L171.06 1000Z";
const font = readFileSync("public/fonts/report-sans-bold.ttf").toString(
  "base64",
);

// Brand colours (docs/brand/colour): catalogue on Stone, admin on Slate, billing on Bronze.
const apps = {
  icon: {
    bg: ["#F6F5F2", "#F6F5F2"],
    mark: ["#C99A63", "#7A4E26"],
  },
  admin: {
    bg: ["#28333F", "#1A222B"],
    mark: ["#E2BE8A", "#B07D4C"],
    chip: "#D7C2A1",
    glyph: "grid",
  },
  pos: {
    bg: ["#9A6835", "#6E4521"],
    mark: ["#FBF7F0", "#EADBC6"],
    chip: "#F6F5F2",
    glyph: "rupee",
  },
};

/** One icon as SVG. `scale` shrinks the artwork for maskable icons' safe zone. */
function svg(app, size, scale) {
  const a = apps[app];
  const h = 316 * scale; // mark height on a 512 canvas
  const k = h / 1000;
  const w = 719.44 * k;
  const x = 256 - w / 2;
  const y = 256 - h / 2;
  // The symbol sits in the mark's empty top-right corner, like a superscript.
  const s = 78 * scale;
  const cx = x + 585 * k;
  const cy = y + 215 * k;
  const glyph =
    a.glyph === "grid"
      ? [0, 1]
          .flatMap((i) => [0, 1].map((j) => [i, j]))
          .map(
            ([i, j]) =>
              `<rect x="${cx - s / 2 + i * s * 0.56}" y="${cy - s / 2 + j * s * 0.56}" width="${s * 0.44}" height="${s * 0.44}" rx="${s * 0.1}" fill="${a.chip}"/>`,
          )
          .join("")
      : a.glyph === "rupee"
        ? `<text x="${cx}" y="${cy + s * 0.36}" font-family="LenoreIcon" font-weight="700" font-size="${s * 1.05}" text-anchor="middle" fill="${a.chip}">₹</text>`
        : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <style>@font-face{font-family:LenoreIcon;src:url(data:font/ttf;base64,${font})}</style>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.bg[0]}"/><stop offset="1" stop-color="${a.bg[1]}"/></linearGradient>
    <linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.mark[0]}"/><stop offset="1" stop-color="${a.mark[1]}"/></linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <path transform="translate(${x} ${y}) scale(${k})" fill="url(#m)" d="${MARK}"/>
  ${glyph}
</svg>`;
}

const files = [];
for (const app of Object.keys(apps)) {
  files.push([`${app}-192.png`, app, 192, 1]);
  files.push([`${app}-512.png`, app, 512, 1]);
  files.push([`${app}-maskable-512.png`, app, 512, 0.84]);
}
files.push(["apple-touch-icon.png", "icon", 180, 0.9]);

const local = join(
  homedir(),
  ".cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
);
const browser = await chromium.launch(
  existsSync(local) ? { executablePath: local } : {},
);
const page = await browser.newPage();
for (const [name, app, size, scale] of files) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0">${svg(app, size, scale)}</body>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `public/icons/${name}` });
  console.log(`public/icons/${name}`);
}
await browser.close();
