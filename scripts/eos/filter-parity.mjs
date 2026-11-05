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
const b = await chromium.launch();
const page = await (
  await b.newContext({ viewport: { width: 1400, height: 900 } })
).newPage();
await page.goto(URL);
await page.waitForSelector('input[type="password"]');
await page.fill(
  'input[name="email"], input[type="email"]',
  creds.EOS_TEST_EMAIL,
);
await page.fill('input[type="password"]', creds.EOS_TEST_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForSelector('a[href="#/eos"]');
const total = async (res, filter) => {
  await page.goto(
    URL +
      `#/${res}?filter=${encodeURIComponent(JSON.stringify(filter))}&perPage=100&page=1`,
  );
  await page.waitForTimeout(2000);
  const t = await page
    .locator("text=/\\d+-\\d+ of \\d+/")
    .first()
    .innerText()
    .catch(() => "0 of 0");
  return Number(t.split(" of ")[1]);
};
const open = "(open,in_progress,blocked,ambiguous)";
const cases = {
  c_owner_pat: ["eos_commitments", { owner_sales_id: 4 }],
  c_owner_me_open: [
    "eos_commitments",
    { owner_sales_id: 1, "status@in": open },
  ],
  c_account_northwind: ["eos_commitments", { company_id: 9 }],
  c_status_ambiguous: ["eos_commitments", { status: "ambiguous" }],
  c_overdue: [
    "eos_commitments",
    { "status@in": open, "due_date@lt": process.env.TODAY },
  ],
  c_priority_high: ["eos_commitments", { priority: "high" }],
  c_type_report: ["eos_commitments", { type: "report" }],
  c_combined: [
    "eos_commitments",
    { company_id: 9, owner_sales_id: 4, "status@in": open },
  ],
  i_account_acme_open: [
    "eos_issues",
    { company_id: 8, "status@in": "(open,ids)" },
  ],
  i_priority_high: ["eos_issues", { priority: "high" }],
  needs_review_c: ["eos_commitments", { needs_review: true }],
};
const out = {};
for (const [k, [r, f]] of Object.entries(cases)) out[k] = await total(r, f);
console.log(JSON.stringify(out));
await b.close();
