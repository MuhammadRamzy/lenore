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
      "--persist-to",
      ".wrangler/e2e",
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
      "DELETE FROM quotes WHERE name IN ('E2E buyer','E2E Cart Buyer')",
      // Quotation history is immutable in normal operation; tests lift the guard locally.
      "DROP TRIGGER quotation_versions_no_delete",
      "DELETE FROM quotation_versions WHERE quotation_id IN (SELECT id FROM quotations WHERE customer_name LIKE 'E2E %')",
      "CREATE TRIGGER quotation_versions_no_delete BEFORE DELETE ON quotation_versions BEGIN SELECT RAISE(ABORT, 'Quotation history cannot be deleted.'); END",
      "DELETE FROM quotations WHERE customer_name LIKE 'E2E %'",
      "DELETE FROM customers WHERE name='E2E Dealer'",
      "DELETE FROM price_lists WHERE name='E2E dealer list'",
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
    expect(html).toContain("Your bathroom, <span>considered.</span>");
    expect(html).toContain('"@type":"HomeAndConstructionBusiness"');
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Your bathroom, considered.",
    );
    await expect(page.getByText("GSTIN 32AANFL0054E1ZR").first()).toBeVisible();
    if (width === 390) {
      await page.getByRole("button", { name: "Open menu" }).click();
      const menu = page.getByRole("dialog", { name: "Menu" });
      await expect(menu.getByRole("link", { name: "About" })).toBeVisible();
      await menu.locator("summary").click();
      await expect(
        menu.getByRole("link", { name: /All collections/ }),
      ).toBeVisible();
      await menu.getByRole("button", { name: "Close menu" }).click();
      await expect(
        page.getByRole("navigation", { name: "Quick contact" }),
      ).toBeVisible();
    } else {
      await page.getByRole("button", { name: "Collections" }).click();
      await expect(
        page.locator("#collections-panel").getByRole("link", {
          name: /All collections/,
        }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("#collections-panel")).toHaveCount(0);
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

test("staff quotations apply a saved customer's price list", async ({
  page,
}) => {
  sql(
    "INSERT INTO price_lists(id,name,discount_bp) VALUES('00000000-0000-4000-8000-0000000e2e01','E2E dealer list',1000); " +
      "INSERT INTO customers(id,name,phone,address,price_list_id) VALUES('00000000-0000-4000-8000-0000000e2e02','E2E Dealer','9847022222','Vatakara','00000000-0000-4000-8000-0000000e2e01')",
  );
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalogue");
  const search = page.getByLabel("Search products");
  await search.fill("DEMO-BM01");
  await search.press("Enter");
  await expect(page.getByText("DEMO-BM01 added")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Catalogue sections" })
    .last()
    .getByRole("link", { name: /Quote/ })
    .click();
  await page.getByLabel("Saved customer (optional)").fill("E2E Deal");
  await page.getByRole("button", { name: /E2E Dealer/ }).click();
  await expect(page.getByText("price list E2E dealer list")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "E2E Dealer",
  );
  await expect(page.getByLabel("Place / site")).toHaveValue("Vatakara");
  await expect(
    page.locator(".line-amount").getByText("E2E dealer list"),
  ).toBeVisible();
  await axe(page);
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/quotations") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Save & share/ }).click();
  const q = await (await saved).json();
  expect(q.customerId).toBe("00000000-0000-4000-8000-0000000e2e02");
  expect(q.items[0].unitPricePaise).toBe(
    Math.floor((q.items[0].mrpPaise * 9000 + 5000) / 10000),
  );
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
  // Salespeople see stock status, never the quantity.
  await expect(seller.getByText(/^In stock$/).first()).toBeVisible();
  await expect(seller.getByText(/^In stock · \d+/)).toHaveCount(0);
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
  // A transparent PNG is converted to WebP in the browser before upload.
  await page
    .getByLabel(/Add a product photograph/)
    .setInputFiles("public/images/mixer-cutout.png");
  const upload = page.waitForResponse((r) => r.url().includes("/image?slot="));
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
  const { imageUrl } = (await (await upload).json()) as { imageUrl: string };
  const photo = await page.request.get(imageUrl);
  expect(photo.headers()["content-type"]).toBe("image/webp");
  expect((await photo.body()).length).toBeLessThan(
    readFileSync("public/images/mixer-cutout.png").length,
  );
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
  // Capture what the share sheet would receive.
  await page.addInitScript(() => {
    const w = window as unknown as { shared: unknown };
    Object.assign(navigator, {
      canShare: () => true,
      share: async (d: { files?: File[]; text?: string }) => {
        w.shared = {
          text: d.text,
          type: d.files?.[0]?.type,
          name: d.files?.[0]?.name,
          size: d.files?.[0]?.size,
        };
      },
    });
  });
  await page.goto("/catalogue");
  await page.getByLabel("Search products").fill(code);
  const tile = page.getByRole("button", {
    name: new RegExp(`E2E chrome mixer, ${code}`),
  });
  await expect(tile).toBeVisible();
  await tile.click();
  // Company staff see the shelf; salespeople do not (API test).
  await expect(page.getByText("Shelf Z-09")).toBeVisible();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { shared?: unknown }).shared),
    )
    .toMatchObject({
      type: "image/jpeg",
      name: `Lenore-${code}.jpg`,
      text: expect.stringContaining("E2E chrome mixer"),
    });
});

test("continuous camera scanning counts a held barcode once and shows each result", async ({
  page,
}) => {
  // A fake camera and barcode reader: the test decides what is "in view".
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.inView = null;
    w.BarcodeDetector = class {
      async detect() {
        return w.inView ? [{ rawValue: w.inView as string }] : [];
      }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      setInterval(() => ctx.fillRect(0, 0, 10, 10), 50);
      return canvas.captureStream(10);
    };
  });
  const show = (code: string | null) =>
    page.evaluate((c) => {
      (window as unknown as Record<string, unknown>).inView = c;
    }, code);
  await signIn(page);
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "Stock count" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Scan with camera" })
    .click();
  const status = page.locator(".scanner-status");
  await show("DEMO-BM01");
  await expect(page.locator(".scanner.hit-ok")).toBeVisible();
  await expect(status).toContainText("1 counted");
  // Held in view: no second count, and a hint to move it away.
  await expect(status).toContainText("Same barcode", { timeout: 4000 });
  await expect(page.getByText("1 scanned")).toBeVisible();
  // A brief loss of the code (camera glare) is still the same scan.
  await show(null);
  await page.waitForTimeout(800);
  await show("DEMO-BM01");
  await page.waitForTimeout(600);
  await expect(page.getByText("1 scanned")).toBeVisible();
  // Moved away properly, then scanned again: a second item.
  await show(null);
  await page.waitForTimeout(3000);
  await show("DEMO-BM01");
  await expect(page.getByText("2 scanned")).toBeVisible();
  await expect(status).toContainText("2 counted");
  await show(null);
  await page.waitForTimeout(3000);
  await show("NOT-A-PRODUCT");
  await expect(page.locator(".scanner.hit-bad")).toBeVisible();
  await expect(status).toContainText("no product");
  await show(null);
  await page.getByRole("button", { name: "Done scanning" }).click();
  // A hand scanner re-reading the same barcode counts once; "1 more" adds another.
  const box = page.getByPlaceholder("Scan barcode or search code, name, bin");
  await page.waitForTimeout(2600);
  for (let i = 0; i < 3; i++) {
    await box.fill("DEMO-AC04");
    await box.press("Enter");
  }
  await expect(page.locator(".count-last")).toContainText("ignored");
  await page.getByRole("button", { name: "1 more" }).click();
  await expect(page.locator(".count-last")).toContainText("2 counted");
});

test("a purchase bill can add a product that is not in the list yet", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "Purchases", exact: true }).click();
  await page.getByRole("button", { name: /Record purchase bill/ }).click();
  const find = page.getByLabel("Find product");
  await find.fill("E2E-NEW-1");
  await find.press("Enter");
  const form = page.locator("fieldset.new-product");
  await expect(form.getByLabel("Product code")).toHaveValue("E2E-NEW-1");
  await form.getByLabel("Name").fill("E2E new mixer");
  await form.getByLabel("Collection").fill("Basin mixers");
  await form.getByLabel("MRP (₹)").fill("2450");
  await form.getByRole("button", { name: "Add product to bill" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("cell", { name: /E2E new mixer/ })).toBeVisible();
  // Created as a draft, so it stays off the website until published.
  const r = await page.request.get("/api/catalogue");
  expect(JSON.stringify(await r.json())).not.toContain("E2E-NEW-1");
});

test("visitors fill a cart on the website and send an order request on WhatsApp", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { opened?: string };
    window.open = ((url: string) => {
      w.opened = url;
      return null;
    }) as typeof window.open;
  });
  await page.goto("/");
  const card = page.locator(".product-card").first();
  const name = await card.locator("h3").innerText();
  await card.getByRole("button", { name: "Add to cart" }).click();
  await card.getByRole("button", { name: /Increase/ }).click();
  await page.getByRole("button", { name: "Cart, 2 items" }).click();
  const cart = page.getByRole("dialog", { name: /Your cart/ });
  await expect(cart).toContainText(name);
  await axe(page);
  await cart.getByLabel("Order").check();
  await cart.getByLabel("Name").fill("E2E Cart Buyer");
  await cart.getByLabel("Phone").fill("9847012345");
  await cart.getByLabel(/Place/).fill("Kuttiady");
  await cart
    .getByRole("button", { name: "Send order request on WhatsApp" })
    .click();
  await expect(cart.getByText("Request sent")).toBeVisible();
  const opened = decodeURIComponent(
    (await page.evaluate(
      () => (window as unknown as { opened?: string }).opened,
    ))!,
  );
  expect(opened).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  expect(opened).toContain("I would like to order");
  expect(opened).toContain(`${name}`);
  expect(opened).toContain("× 2");
  expect(opened).toContain("Name: E2E Cart Buyer");
  await cart.getByRole("button", { name: "Clear cart and close" }).click();
  await expect(page.getByRole("button", { name: "Cart, empty" })).toBeVisible();
});

test("the billing counter shows reduced stock right after a sale", async ({
  page,
}) => {
  // Repeated runs bill this demo item; start each run from a known level.
  sql("UPDATE products SET stock=50 WHERE code='DEMO-BM01'");
  await signIn(page);
  await page.goto("/pos");
  const shift = page.getByRole("button", { name: "Open shift" });
  const search = page.getByLabel("Scan or search products");
  await expect(shift.or(search)).toBeVisible();
  if (await shift.isVisible()) {
    await page.getByLabel("Opening cash (₹)").fill("0");
    await shift.click();
  }
  await search.fill("DEMO-BM01");
  const tile = page.locator(".pos-tile", { hasText: "DEMO-BM01" });
  const stockOf = async () =>
    Number((await tile.locator(".pos-stock").innerText()).split(" ")[0]);
  const before = await stockOf();
  expect(before).toBeGreaterThan(0);
  await tile.click();
  await page.keyboard.press("F4");
  await page.getByRole("button", { name: "Complete sale" }).click();
  await page.getByRole("button", { name: /New bill/ }).click();
  await search.fill("DEMO-BM01");
  await expect.poll(stockOf).toBe(before - 1);
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
