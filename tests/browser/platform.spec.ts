import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { PDFDocument } from "pdf-lib";

const password = /Password: (.+)/.exec(
  readFileSync("local-access.txt", "utf8"),
)![1];
const SALES_PHONE = "9990001234";
const SALES_PASSWORD = "e2e-sales-pass";

function sql(command: string) {
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "lenore-local",
      "--local",
      "--command",
      command,
    ],
    { stdio: "pipe" },
  );
}
/** Removes browser fixtures from the local demonstration database only. */
function cleanFixtures() {
  const products = "SELECT id FROM products WHERE code LIKE 'E2E-%'";
  sql(
    [
      `DELETE FROM activity WHERE product_id IN (${products})`,
      `DELETE FROM stock_movements WHERE product_id IN (${products})`,
      `DELETE FROM product_views WHERE product_id IN (${products})`,
      "DELETE FROM products WHERE code LIKE 'E2E-%'",
      "DELETE FROM quotes WHERE name='E2E buyer'",
      // Quotation history is immutable in normal operation; tests lift the guard locally.
      "DROP TRIGGER quotation_versions_no_delete",
      "DELETE FROM quotation_versions WHERE quotation_id IN (SELECT id FROM quotations WHERE customer_name LIKE 'E2E %')",
      "CREATE TRIGGER quotation_versions_no_delete BEFORE DELETE ON quotation_versions BEGIN SELECT RAISE(ABORT, 'Quotation history cannot be deleted.'); END",
      "DELETE FROM quotations WHERE customer_name LIKE 'E2E %'",
      `DELETE FROM sessions WHERE user_id IN (SELECT id FROM staff_users WHERE phone='${SALES_PHONE}')`,
      `DELETE FROM staff_users WHERE phone='${SALES_PHONE}'`,
      "UPDATE catalogue_access SET mode='public',enabled=0,generation=generation+1,revision=revision+1 WHERE id=1",
      "UPDATE settings SET pricing_mode='mrp' WHERE id=1",
      "DELETE FROM rate_limits",
    ].join("; "),
  );
}
test.beforeAll(async ({ request }) => {
  const config = await (await request.get("/api/config")).json();
  expect(
    config.demo,
    "Browser tests require the local demonstration database.",
  ).toBe(true);
  cleanFixtures();
});
test.afterAll(() => cleanFixtures());

async function signIn(page: Page) {
  await page.goto("/manage");
  await page.getByLabel("Username or phone").fill("owner");
  await page.getByLabel("Workspace password").fill(password);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}
async function axe(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations,
    JSON.stringify(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  ).toEqual([]);
}

test("website is server-rendered, navigable and accepts enquiries on desktop and mobile", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto("/");
    const html = await response!.text();
    expect(html).toContain("Refined bathroom living");
    expect(html).toContain('"@type":"HomeAndConstructionBusiness"');
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Refined bathroom living",
    );
    await expect(page.getByText("GSTIN 32AANFL0054E1ZR").first()).toBeVisible();
    if (width === 390) {
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(
        page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link", { name: "About" }),
      ).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Quick contact" }),
      ).toBeVisible();
    }
  }
  await page.goto("/collections/showers");
  await expect(
    page.getByRole("heading", { level: 1, name: "Showers" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Overhead shower/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Overhead shower" }),
  ).toBeVisible();
  await expect(page.getByText("DEMO-SH02").first()).toBeVisible();
  await page.goto("/contact");
  await page.getByLabel("Name").fill("E2E buyer");
  await page.getByLabel("Phone").fill("9847012345");
  await page.getByLabel("Message").fill("Browser test enquiry");
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByText("Our team will contact you soon")).toBeVisible();
});

test("a visitor builds, saves and shares a quotation from the phone catalogue", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalogue");
  const search = page.getByLabel("Search products");
  await search.fill("DEMO-BM01");
  await search.press("Enter");
  await expect(page.getByText("DEMO-BM01 added")).toBeVisible();
  await page.getByRole("button", { name: /Overhead shower/ }).click();
  await page
    .getByRole("button", { name: "Increase Quantity", exact: true })
    .click();
  await page.getByRole("button", { name: "Add to quote" }).click();
  await page
    .getByRole("navigation", { name: "Catalogue sections" })
    .last()
    .getByRole("link", { name: /Quote/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "New quotation" }),
  ).toBeVisible();
  // Draft survives a reload.
  await page.reload();
  await expect(page.getByText("Single lever basin mixer")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("E2E Rahim");
  await page.getByLabel("Place / site").fill("Kuttiady");
  await page.getByRole("button", { name: /Save & share/ }).click();
  await expect(
    page.getByRole("link", { name: /Send on WhatsApp/ }),
  ).toBeVisible();
  const whatsapp = await page
    .getByRole("link", { name: /Send on WhatsApp/ })
    .getAttribute("href");
  expect(whatsapp).toMatch(/^https:\/\/wa\.me\/\?text=/);
  const text = decodeURIComponent(whatsapp!.split("text=")[1]);
  expect(text).toContain("E2E Rahim");
  expect(text).toContain("Overhead shower");
  expect(text).toMatch(/\/q\/[0-9a-f]{36}/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Share PDF/ }).click();
  const file = await download;
  const pdf = await PDFDocument.load(readFileSync(await file.path()));
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  expect(pdf.getTitle()).toMatch(/Lenore quotation LQ-\d{4}-\d{4}/);
  const link = text.match(/https?:\/\/[^\s]+\/q\/[0-9a-f]{36}/)![0];
  const customer = await page.context().newPage();
  const response = await customer.goto(link);
  expect(response!.headers()["x-robots-tag"]).toContain("noindex");
  await expect(
    customer.getByRole("article", { name: /Quotation LQ-/ }),
  ).toContainText("E2E Rahim");
  await page.goto("/catalogue/quotes");
  await expect(page.getByRole("button", { name: /E2E Rahim/ })).toBeVisible();
});

test("admins add a salesperson, lock the catalogue to accounts and allow capped discounts", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByRole("button", { name: "Add team member" }).click();
  await page.getByLabel("Name").fill("E2E Seller");
  await page.getByLabel("Phone number (sign-in ID)").fill(SALES_PHONE);
  await page.getByLabel("Discount limit %").fill("8");
  await page.getByLabel("Temporary password").fill(SALES_PASSWORD);
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByRole("cell", { name: "E2E Seller" })).toBeVisible();
  await page.getByRole("button", { name: "Access & pricing" }).click();
  await page.getByLabel(/Team accounts only/).check();
  await page.getByRole("button", { name: "Save access" }).click();
  await expect(page.getByText("Catalogue access saved.")).toBeVisible();
  await page.getByLabel(/Discount up to a limit/).check();
  await page.getByRole("button", { name: "Save pricing" }).click();
  await expect(page.getByText("Quotation settings saved.")).toBeVisible();

  const seller = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  await seller.goto("/catalogue");
  await expect(
    seller.getByRole("heading", { name: "Lenore catalogue" }),
  ).toBeVisible();
  expect((await seller.request.get("/api/catalogue")).status()).toBe(401);
  await seller.getByLabel("Phone number").fill(SALES_PHONE);
  await seller.getByLabel("Password").fill(SALES_PASSWORD);
  await seller.getByRole("button", { name: "Open catalogue" }).click();
  // Salespeople see exact quantities (the demo stock changes as tests bill it).
  await expect(seller.getByText(/^In stock · \d+ pcs$/).first()).toBeVisible();
  await seller.getByRole("button", { name: "Add DEMO-AC04 to quote" }).click();
  await seller.goto("/catalogue/quote");
  await seller.getByLabel("Name", { exact: true }).fill("E2E Builder");
  await seller.getByLabel("Discount percent for DEMO-AC04").fill("9");
  await expect(seller.getByLabel("Discount percent for DEMO-AC04")).toHaveValue(
    "8",
  );
  await seller.getByRole("button", { name: /Save & share/ }).click();
  await expect(seller.getByText("−8%")).toBeVisible();
  await seller.getByRole("button", { name: "Won" }).click();
  await expect(seller.getByText("Marked won")).toBeVisible();

  await page.getByRole("button", { name: "Quotations", exact: true }).click();
  await expect(page.getByRole("cell", { name: /E2E Builder/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E Seller" })).toBeVisible();
});

test("admins create, publish and stock a product, and the catalogue reflects it", async ({
  page,
}) => {
  const code = `E2E-${Date.now().toString().slice(-6)}`;
  await signIn(page);
  await page.getByRole("button", { name: "Products", exact: true }).click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("Product name").fill("E2E chrome mixer");
  await page.getByLabel("Product code").fill(code);
  await page.getByLabel("Category", { exact: true }).fill("Basin mixers");
  await page.getByLabel(/Suggested MRP/).fill("3200");
  await page
    .getByLabel("Barcode")
    .fill(`89${Date.now().toString().slice(-11)}`);
  await page.getByLabel("Shelf / bin").fill("Z-09");
  await page.getByText("Publish to the sales catalogue").click();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page
    .getByRole("row", { name: new RegExp(code) })
    .getByRole("button", { name: /Adjust|stock/i })
    .first()
    .click();
  await page.getByLabel("Quantity", { exact: true }).fill("6");
  await page.getByLabel("Reason").fill("Goods received from supplier");
  await page.getByRole("button", { name: /Record adjustment/ }).click();
  await expect(page.getByText(/saved|recorded/i).first()).toBeVisible();
  await page.goto("/catalogue");
  await page.getByLabel("Search products").fill(code);
  await expect(
    page.getByRole("button", { name: new RegExp(`E2E chrome mixer, ${code}`) }),
  ).toBeVisible();
});

test("the sales catalogue is an installable PWA with an offline shell", async ({
  page,
}) => {
  sql("UPDATE catalogue_access SET mode='public' WHERE id=1");
  await page.goto("/catalogue");
  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  const manifest = await (await page.request.get(manifestHref!)).json();
  expect(manifest).toMatchObject({
    display: "standalone",
    start_url: "/catalogue",
  });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  for (const icon of manifest.icons)
    expect((await page.request.get(icon.src)).status()).toBe(200);
  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.scope;
  });
  expect(scope).toMatch(/\/$/);
  // Once the shell is cached the catalogue opens without a network.
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Overhead shower/ }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByText(/Offline/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Overhead shower/ }),
  ).toBeVisible();
  await page.context().setOffline(false);
});

test("main surfaces pass automated accessibility checks on desktop and mobile", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/",
      "/collections",
      "/products/overhead-shower-demo-sh02",
      "/contact",
      "/catalogue",
    ]) {
      await page.goto(path);
      if (path === "/catalogue")
        await expect(
          page.getByRole("button", { name: /Overhead shower/ }),
        ).toBeVisible();
      await axe(page);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await axe(page);
  await page.getByRole("button", { name: "Insights", exact: true }).click();
  await expect(page.getByText("Quotations per day")).toBeVisible();
  await axe(page);
});
