import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { FIRST_SALES_GOAL_CENTS, firstSalesGoal } from "@/lib/admin-ops";
import { formatGeneratedAt } from "@/lib/report";

function readSrc(relative: string) {
  return readFile(
    fileURLToPath(new URL(`../src/${relative}`, import.meta.url)),
    "utf8",
  );
}

describe("first sales goal", () => {
  it("is $1,000 of collected (kept) money", () => {
    assert.equal(FIRST_SALES_GOAL_CENTS, 100_000);
    const empty = firstSalesGoal(0);
    assert.equal(empty.percent, 0);
    assert.equal(empty.reached, false);
    assert.match(empty.label, /\$0\.00 of \$1,000\.00 collected/);

    const mid = firstSalesGoal(14_999);
    assert.equal(mid.percent, 15);
    assert.equal(mid.remainingCents, 85_001);

    const done = firstSalesGoal(100_000);
    assert.equal(done.percent, 100);
    assert.equal(done.reached, true);
    assert.equal(done.remainingCents, 0);

    const over = firstSalesGoal(150_000);
    assert.equal(over.percent, 100);
    assert.equal(over.reached, true);
    assert.match(over.label, /\$1,500\.00 collected/);
  });
});

describe("admin console", () => {
  it("prints order times in Denver, not UTC", async () => {
    const page = await readSrc("app/admin/page.tsx");
    assert.match(page, /formatGeneratedAt\(order\.createdAt\)/);
    assert.match(page, /Created \(Denver\)/);
    assert.doesNotMatch(page, /Created \(UTC\)/);
    assert.doesNotMatch(page, /toISOString\(\)\.replace\("T"/);
    assert.equal(formatGeneratedAt("2026-01-14T15:04:00.000Z"), "Jan 14, 2026, 8:04 AM MST");
  });

  it("shows collected progress toward the first $1,000", async () => {
    const page = await readSrc("app/admin/page.tsx");
    assert.match(page, /firstSalesGoal\(stats\.revenueCents\)/);
    assert.match(page, /First \$1,000/);
    assert.doesNotMatch(
      await readSrc("components/site-footer.tsx"),
      /First \$1,000/,
    );
  });

  it("keeps /admin and /admin/login noindex and off the customer footer", async () => {
    const admin = await readSrc("app/admin/page.tsx");
    const login = await readSrc("app/admin/login/page.tsx");
    assert.match(admin, /robots:\s*\{\s*index:\s*false/);
    assert.match(login, /robots:\s*\{\s*index:\s*false/);

    const robots = await readSrc("app/robots.ts");
    assert.match(robots, /"\/admin"/);

    const sitemap = await readSrc("app/sitemap.ts");
    assert.doesNotMatch(sitemap, /\/admin/);

    const footer = await readSrc("components/site-footer.tsx");
    const header = await readSrc("components/site-header.tsx");
    assert.doesNotMatch(footer, /href=["']\/admin/);
    assert.doesNotMatch(header, /href=["']\/admin/);
  });

  it("keeps the VinAudit copy link on admin only", async () => {
    const admin = await readSrc("app/admin/page.tsx");
    assert.match(admin, /VinAudit copy/);
    const footer = await readSrc("components/site-footer.tsx");
    const home = await readSrc("app/page.tsx");
    assert.doesNotMatch(footer, /VinAudit/);
    assert.doesNotMatch(home, /VinAudit/);
  });

  it("loads live vendor credits on /admin and never hard-codes fake zeros", async () => {
    const page = await readSrc("app/admin/page.tsx");
    const card = await readSrc("app/admin/api-credits.tsx");
    assert.match(page, /fetchVendorCredits\(\)/);
    assert.match(page, /<ApiCredits report=\{credits\} \/>/);
    assert.match(card, /API credits/);
    assert.match(card, /No credit APIs configured/);
    assert.match(card, /noneConfigured/);
    assert.match(card, /hasAnyCreditApiConfigured/);
    assert.match(card, /BILLING_UNAVAILABLE/);
    assert.match(card, /item\.error \?\? "Unavailable"/);
    assert.match(card, /Remaining credits:/);
    assert.match(card, /Console Billing ↗/);
    assert.match(card, /anthropicBillingUrl/);
    assert.match(card, /noreferrer noopener/);
    assert.match(card, /text-brand-600/);
    assert.doesNotMatch(card, /\$0\.00/);
    assert.doesNotMatch(page, /\$0\.00 available/);

    const credits = await readSrc("lib/vendor-credits.ts");
    assert.match(credits, /retrieveStripeBalance/);
    assert.match(credits, /BILLING_UNAVAILABLE/);
    assert.match(credits, /FAL_NEEDS_ADMIN_KEY/);
    assert.match(credits, /organizations\/cost_report/);
    assert.match(credits, /anthropic-version/);
    assert.match(credits, /ANTHROPIC_ADMIN_API_KEY|adminApiKey/);
    assert.match(credits, /ANTHROPIC_CONSOLE_BILLING_URL|anthropicBillingUrl/);
    assert.match(credits, /console\.anthropic\.com\/settings\/billing/);
    assert.doesNotMatch(credits, /organizations\/balance/);
    assert.doesNotMatch(credits, /document\.cookie|sessionStorage|localStorage/);
    assert.doesNotMatch(credits, /api\.stripe\.com\/v1\/balance/);
    const stripe = await readSrc("lib/stripe.ts");
    assert.match(stripe, /export async function retrieveStripeBalance/);
    assert.match(stripe, /getStripe\(\)\.balance\.retrieve\(/);
    assert.match(stripe, /createNodeHttpClient/);
    const nextConfig = await readFile(
      fileURLToPath(new URL("../next.config.ts", import.meta.url)),
      "utf8",
    );
    assert.match(nextConfig, /serverExternalPackages: \["stripe"\]/);
    assert.match(page, /runtime = "nodejs"/);

    const status = await readSrc("lib/status.ts");
    const statusPage = await readSrc("app/status/page.tsx");
    const statusApi = await readSrc("app/api/status/route.ts");
    assert.doesNotMatch(status, /fetchVendorCredits|vendor-credits/);
    assert.doesNotMatch(statusPage, /fetchVendorCredits|API credits|Console Billing/);
    assert.doesNotMatch(statusApi, /fetchVendorCredits|vendor-credits/);
  });

  it("puts API credits under the stats cards, not in the orders table", async () => {
    const page = await readSrc("app/admin/page.tsx");
    const statsIdx = page.indexOf("lg:grid-cols-6");
    const creditsIdx = page.indexOf("<ApiCredits");
    const tableIdx = page.indexOf("orders.length === 0");
    assert.ok(statsIdx > 0 && creditsIdx > statsIdx && tableIdx > creditsIdx);

    const actions = await readSrc("app/admin/order-actions.tsx");
    assert.doesNotMatch(actions, /ApiCredits|fetchVendorCredits|API credits/);
  });

  it("isolates credit fetches so a vendor outage cannot take down /admin", async () => {
    const page = await readSrc("app/admin/page.tsx");
    assert.match(page, /fetchVendorCredits\(\)\.catch/);
    assert.match(page, /emptyVendorCredits/);
    assert.match(page, /retryFulfillmentAction|OrderActions/);
  });
});
