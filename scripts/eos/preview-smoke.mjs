// EOS v1a STAGING smoke (Playwright). Usage: URL=<preview> EOS_CREDS_FILE=<gitignored file> node scripts/eos/<file>.mjs
/* eslint-disable no-console */
import { chromium } from "playwright";
import fs from "fs";
const URL = process.env.URL;
const creds = Object.fromEntries(
  fs
    .readFileSync(
      process.env.EOS_CREDS_FILE ?? "/home/box/.eos-staging-creds",
      "utf8",
    )
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => l.split("=")),
);
const OUT = process.env.OUT ?? "./eos-screens";
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();
page.on("pageerror", (e) => log("PAGEERROR", e.message));
const shot = async (n, p = page) => {
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
  log("shot", n);
};
await page.goto(URL);
await page.waitForSelector('input[type="email"], input[name="email"]', {
  timeout: 30000,
});
await page.fill(
  'input[name="email"], input[type="email"]',
  creds.EOS_TEST_EMAIL,
);
await page.fill('input[type="password"]', creds.EOS_TEST_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForSelector('a[href="#/eos"]', { timeout: 30000 });
await shot("01-dashboard-eos-tab");
await page.click('a[href="#/eos"]');
await page.waitForSelector('[data-testid="eos-accounts"] >> text=Acme', {
  timeout: 20000,
});
await shot("02-eos-accounts");

const pick = async (label, text) => {
  const inp = page.getByLabel(label, { exact: true }).first();
  await inp.click();
  await page.waitForTimeout(300);
  await page.keyboard.type(text);
  await page.waitForTimeout(1200);
  await page
    .getByRole("option", { name: new RegExp(text, "i") })
    .first()
    .click();
};
fs.writeFileSync(
  "/tmp/eos-att.pdf",
  "%PDF-1.4\n% synthetic EOS test attachment\n",
);
const stamp = Date.now().toString().slice(-5);
// Project
await page.goto(URL + "#/eos_projects/create");
await page.getByLabel("Title", { exact: true }).fill("E2E Project " + stamp);
await pick("Account", "Northwind");
await shot("03-project-create");
await page.getByRole("button", { name: /save/i }).click();
await page.waitForURL(/eos_projects\/[0-9a-f-]{36}/, { timeout: 20000 });
log("project created", page.url());
// Commitment with link + upload
await page.goto(URL + "#/eos_commitments/create");
await page.getByLabel("Title", { exact: true }).fill("E2E Commitment " + stamp);
await pick("Account", "Northwind");
await pick("Project", "E2E Project " + stamp);
await pick("Owner", "Pat");
await page
  .getByLabel("Due date")
  .fill("2026-11-01")
  .catch(() => log("due fill failed"));
await page.getByRole("button", { name: /add/i }).first().click();
await page
  .getByLabel("URL", { exact: true })
  .first()
  .fill("https://drive.google.com/file/d/synthetic-test");
await page.getByLabel("Label", { exact: true }).first().fill("Brief (Drive)");
await page.setInputFiles('input[type="file"]', "/tmp/eos-att.pdf");
await shot("04-commitment-create");
await page.getByRole("button", { name: /save/i }).click();
await page.waitForTimeout(5000);
await shot("04b-after-save");
log(
  "notif:",
  await page
    .locator("[data-sonner-toast], [role=alert], li[data-type]")
    .allInnerTexts(),
);
await page.waitForURL(/eos_commitments\/[0-9a-f-]{36}/, { timeout: 30000 });
await page.waitForSelector('[data-testid="eos-attachments"]', {
  timeout: 20000,
});
await shot("05-commitment-edit-with-file");
// signed url
const [popup] = await Promise.all([
  page.waitForEvent("popup", { timeout: 15000 }),
  page.locator('[data-testid="eos-attachments"] button').first().click(),
]);
log(
  "signed url opened",
  popup.url().includes("/object/sign/eos-attachments/")
    ? "OK signed"
    : popup.url().slice(0, 80),
);
await popup.close();
// Issue
await page.goto(URL + "#/eos_issues/create");
await page.getByLabel("Title", { exact: true }).fill("E2E Issue " + stamp);
await pick("Account", "Northwind");
await pick("Project", "E2E Project " + stamp);
await page.getByRole("button", { name: /save/i }).click();
await page.waitForURL(/eos_issues\/[0-9a-f-]{36}/, { timeout: 20000 });
log("issue created");
// Lists + filters
const count = async () => {
  await page.waitForTimeout(1500);
  return await page.locator("tbody tr").count();
};
await page.goto(URL + "#/eos_commitments");
log("commitments all", await count());
await page.getByRole("button", { name: "Overdue" }).click();
log("overdue", await count());
await shot("06-commitments-overdue");
await page.getByRole("button", { name: "My open" }).click();
log("my open", await count());
await page.getByRole("button", { name: "By account" }).click();
log("by account", await count());
await page.goto(
  URL +
    "#/eos_commitments?filter=" +
    encodeURIComponent(JSON.stringify({ owner_sales_id: 4 })),
);
log("owner=Pat", await count());
await shot("07-commitments-owner-filter");
await page.goto(
  URL +
    "#/eos_commitments?filter=" +
    encodeURIComponent(JSON.stringify({ status: "blocked" })),
);
log("status=blocked", await count());
await page.goto(
  URL +
    "#/eos_commitments?filter=" +
    encodeURIComponent(JSON.stringify({ priority: "high" })),
);
log("priority=high", await count());
await page.goto(
  URL +
    "#/eos_issues?filter=" +
    encodeURIComponent(JSON.stringify({ type: "internal" })),
);
log("issues type=internal", await count());
await page.goto(URL + "#/eos");
await page.waitForSelector('[data-testid="eos-accounts"] >> text=Northwind');
await page
  .locator('[data-testid="eos-accounts"] >> text=Northwind')
  .locator("..")
  .locator("..")
  .getByText("Open commitments")
  .click();
log("account drilldown", await count(), page.url().slice(-80));
await shot("08-account-drilldown");
// Import
await page.goto(URL + "#/eos/import");
await page.click('[data-testid="eos-run-import"]');
await page.waitForSelector('[data-testid="eos-recon"]', { timeout: 60000 });
await page.waitForTimeout(1000);
log(
  "recon:",
  (await page.locator('[data-testid="eos-recon"]').allInnerTexts())
    .map((t) => t.split("\n").slice(0, 4).join(" | "))
    .join(" || "),
);
await shot("09-import-reconcile");
await page.click('[data-testid="eos-run-import"]');
await page.waitForTimeout(4000);
log(
  "rerun:",
  (await page.locator('[data-testid="eos-recon"]').allInnerTexts())
    .map((t) => t.split("\n")[0])
    .join(" || "),
);
await page.goto(URL + "#/eos_commitments");
await page.getByRole("button", { name: "Needs review" }).click();
log("needs review", await count());
await shot("10-needs-review");
// Mobile 390
const m = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  storageState: await ctx.storageState(),
});
const mp = await m.newPage();
for (const [n, path] of [
  ["11-mobile-eos-accounts", "#/eos"],
  ["12-mobile-commitments", "#/eos_commitments"],
  ["13-mobile-import", "#/eos/import"],
]) {
  await mp.goto(URL + path);
  await mp.waitForTimeout(3000);
  await shot(n, mp);
}

await browser.close();
