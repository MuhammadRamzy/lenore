import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { PDFDocument } from "pdf-lib";

const password = /Password: (.+)/.exec(
  readFileSync("local-access.txt", "utf8"),
)![1];
const captures = ".impeccable/review";
mkdirSync(captures, { recursive: true });

test.beforeAll(async ({ request }) => {
  const config = await (await request.get("/api/config")).json();
  expect(
    config.demo,
    "Browser mutation tests require the local demonstration database.",
  ).toBe(true);
  cleanFixtures();
});
function cleanFixtures() {
  const condition = "code LIKE 'E2E-%' AND name='Browser fixture mixer'";
  const sql = `DELETE FROM activity WHERE product_id IN (SELECT id FROM products WHERE ${condition}); DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE ${condition}); DELETE FROM products WHERE ${condition}; DELETE FROM quotes WHERE name='Browser test buyer';`;
  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "lenore-local", "--local", "--command", sql],
    { stdio: "pipe" },
  );
}
test.afterAll(() => cleanFixtures());

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/manage");
  await page.getByLabel("Workspace password").fill(password);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add product", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Needs a closer look", exact: true }),
  ).toBeVisible();
}
test("landing and catalogue render at desktop and mobile widths", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [label, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "Bath fittings. Beautifully simple.",
      }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".hero-image img")).toHaveJSProperty(
      "complete",
      true,
    );
    await expect
      .poll(() =>
        page
          .locator(".hero-image img")
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.screenshot({
      path: `${captures}/landing-${label}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("link", { name: "Explore the collection", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("button", {
        name: "Single lever basin mixer",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".demo-product-visual")).toHaveCount(4);
    for (const photo of await page.locator(".demo-product-visual img").all()) {
      await expect
        .poll(() =>
          photo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
    }
    await page.screenshot({
      path: `${captures}/catalogue-${label}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Single lever basin mixer", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", {
        name: "Single lever basin mixer",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({ path: `${captures}/detail-${label}.png` });
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
test("catalogue search, quantity persistence and enquiry submission work", async ({
  page,
}) => {
  await page.goto("/catalogue");
  await page.getByLabel("Search collection").fill("basin");
  await expect(
    page.getByRole("button", { name: "Single lever basin mixer", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Towel rail", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add Single lever basin mixer to enquiry" })
    .click();
  await page.getByRole("button", { name: /Enquiry/ }).click();
  await page.getByLabel("Quantity for Single lever basin mixer").fill("3");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: /Your enquiry/ }),
  ).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Enquiry/ }).click();
  await expect(
    page.getByLabel("Quantity for Single lever basin mixer"),
  ).toHaveValue("3");
  await page.getByLabel("Your name").fill("Browser test buyer");
  await page.getByLabel("Phone number").fill("9999999999");
  for (const [label, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.locator(".basket-panel").evaluate((panel) => {
      panel.scrollTop = 0;
    });
    await page.screenshot({ path: `${captures}/enquiry-${label}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Send enquiry", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Enquiry received");
  await page.getByLabel("Your name").fill("Browser buyer രമ്യ");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadEvent;
  await download.saveAs("/tmp/lenore-quotation-sample.pdf");
  const downloadPath = await download.path();
  const pdf = await PDFDocument.load(readFileSync(downloadPath!));
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  expect(pdf.getTitle()).toContain("Lenore quotation");
  await expect(
    page.getByRole("link", { name: "Share on WhatsApp" }),
  ).toHaveAttribute("href", /wa.me/);
});
test("workspace renders at desktop and mobile with working navigation", async ({
  page,
}) => {
  await signIn(page);
  for (const [label, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${captures}/${label}.png`, fullPage: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Inventory", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search products").fill("DEMO-SH02");
  await expect(page.getByRole("button", { name: "Adjust stock" })).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "Adjust stock" }).click();
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await page.getByLabel("Reason").fill("Browser verification: received stock");
  await page.getByRole("button", { name: "Record adjustment" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Stock adjustment recorded",
  );
  await page.getByRole("button", { name: "Adjust stock" }).click();
  await page.getByLabel("Adjustment type").selectOption("issue");
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await page
    .getByLabel("Reason")
    .fill("Browser verification: restore opening balance");
  await page.getByRole("button", { name: "Record adjustment" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Stock adjustment recorded",
  );
  await page.getByRole("button", { name: "Low stock", exact: true }).click();
  await page.getByLabel("Filter category").selectOption("Showers");
  const exportEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export view (CSV)", exact: true })
    .click();
  const csv = await exportEvent;
  expect(csv.suggestedFilename()).toContain("Lenore-inventory");
  const content = readFileSync((await csv.path())!, "utf8");
  expect(content).toContain("DEMO-SH02");
  expect(content).not.toContain("DEMO-BM01");
});
test("create, publish, edit and unpublish a product across management and catalogue", async ({
  page,
}) => {
  await signIn(page);
  const code = `E2E-${Date.now()}`;
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Browser fixture mixer");
  await page.getByLabel("Product code", { exact: true }).fill(code);
  await page.getByLabel("Category", { exact: true }).fill("Basin mixers");
  await page.getByLabel("Suggested MRP in INR").fill("1250.50");
  await page.getByLabel("Publish to the sales catalogue").check();
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Product saved");
  await page.getByRole("button", { name: "Products", exact: true }).click();
  await page.getByLabel("Search products").fill(code);
  await page.getByRole("button", { name: "Edit product", exact: true }).click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Edited and persisted in the local database.");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Product saved");
  const catalogue = await page.context().newPage();
  await catalogue.goto("/catalogue");
  await catalogue.getByLabel("Search collection").fill(code);
  await expect(
    catalogue.getByRole("button", {
      name: "Browser fixture mixer",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Catalogue", exact: true }).click();
  await page.getByLabel("Search products").fill(code);
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Product moved to draft",
  );
  await catalogue.reload();
  await catalogue.getByLabel("Search collection").fill(code);
  await expect(
    catalogue.getByRole("heading", { name: "No products match your search." }),
  ).toBeVisible();
});
test("contact settings persist and logout removes management access", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Not configured", { exact: true })).toBeVisible();
  await page.getByLabel("WhatsApp number").fill("");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Contact settings saved",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Workspace password")).toBeVisible();
  expect((await page.request.get("/api/admin/products")).status()).toBe(401);
});

test("workspace failures remain truthful and enquiry errors remain in the open dialog", async ({
  page,
}) => {
  await page.route("**/api/admin/products", (route) =>
    route.fulfill({ status: 503, json: { error: "Temporary test failure" } }),
  );
  await page.goto("/manage");
  await page.getByLabel("Workspace password").fill(password);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Workspace data is unavailable." }),
  ).toBeVisible();
  await expect(page.getByText("Stock is in good shape.")).not.toBeVisible();
  await page.unroute("**/api/admin/products");
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Needs a closer look", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enquiries", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Enquiries", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("button", { name: /Browser test buyer/ })
    .first()
    .click();
  await page.route("**/api/admin/quotes/*", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Follow-up could not be saved" },
    }),
  );
  await page.getByLabel("Follow-up status").selectOption("contacted");
  await expect(page.locator("dialog").getByRole("alert")).toContainText(
    "Follow-up could not be saved",
  );
  await expect(page.getByLabel("Follow-up status")).toHaveValue("new");
  await page.unroute("**/api/admin/quotes/*");
  await page.getByLabel("Follow-up status").selectOption("contacted");
  await expect(page.getByLabel("Follow-up status")).toBeEnabled();
  await expect(page.getByLabel("Follow-up status")).toHaveValue("contacted");
  await expect(page.locator("dialog").getByRole("alert")).toHaveCount(0);
});

test("main surfaces pass automated accessibility checks on desktop and mobile", async ({
  page,
}) => {
  await signIn(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/", "/catalogue", "/manage"]) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      if (path === "/manage")
        await expect(
          page.getByRole("heading", {
            name: "Needs a closer look",
            exact: true,
          }),
        ).toBeVisible();
      if (path === "/catalogue")
        await expect(
          page.getByRole("button", {
            name: "Single lever basin mixer",
            exact: true,
          }),
        ).toBeVisible();
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
  }
});
