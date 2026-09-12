import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ABANDONED_CHECKOUT_LABEL,
  FIRST_SALES_GOAL_CENTS,
  abandonedCheckoutStats,
  firstSalesGoal,
  orderReportHref,
} from "@/lib/admin-ops";
import { formatGeneratedAt } from "@/lib/report";
import {
  checkoutConversionPercent,
  isMoneyActivityStatus,
  isUnpaidCheckoutStatus,
  unpaidCheckoutWindowCounts,
} from "@/lib/store/unpaid-checkouts";

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
    assert.match(page, /Times in Denver/);
    assert.doesNotMatch(page, /Storage:/);
    assert.doesNotMatch(page, /store\.description/);
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
    assert.match(credits, /googleads\.googleapis\.com/);
    assert.match(credits, /oauth2\/v3\/token/);
    assert.match(credits, /metrics\.cost_micros/);
    assert.match(credits, /DURING \$\{range\}/);
    assert.match(credits, /"TODAY"/);
    assert.match(credits, /"THIS_MONTH"/);
    assert.match(credits, /login-customer-id/);
    const envExample = await readFile(
      fileURLToPath(new URL("../.env.example", import.meta.url)),
      "utf8",
    );
    assert.match(envExample, /GOOGLE_ADS_LOGIN_CUSTOMER_ID/);
    assert.match(envExample, /manager \(MCC\)|MCC \/ manager/i);
    assert.doesNotMatch(credits, /api\.stripe\.com\/v1\/balance/);
    assert.doesNotMatch(credits, /from ["']@\/lib\/google-ads["']/);
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
    assert.doesNotMatch(status, /fetchVendorCredits|vendor-credits|Ads spend|google-ads/);
    assert.doesNotMatch(statusPage, /fetchVendorCredits|API credits|Console Billing|Ads spend/);
    assert.doesNotMatch(statusApi, /fetchVendorCredits|vendor-credits|Ads spend/);
  });

  it("keeps unpaid Pending checkouts out of the main orders list", async () => {
    const page = await readSrc("app/admin/page.tsx");
    const abandoned = await readSrc("app/admin/abandoned-checkouts.tsx");
    assert.match(page, /MONEY_ACTIVITY_STATUSES/);
    assert.match(page, /UNPAID_CHECKOUT_STATUSES/);
    assert.match(page, /abandonedCheckoutStats\(stats\)/);
    assert.match(page, /<AbandonedCheckouts orders=\{abandoned\}/);
    assert.match(page, /No paid orders yet/);
    assert.doesNotMatch(page, /Orders appear here as soon as a customer starts checkout/);
    assert.match(abandoned, /Abandoned checkouts/);
    assert.match(abandoned, /ABANDONED_CHECKOUT_LABEL/);
    assert.match(abandoned, /Abandoned today/);
    assert.match(abandoned, /Abandoned MTD/);
    assert.match(abandoned, /Checkout conversion/);
    assert.equal(ABANDONED_CHECKOUT_LABEL, "Abandoned checkout (not paid)");
    assert.doesNotMatch(abandoned, /OrderActions|retryFulfillment|resendEmail|sendReportEmail/);
    assert.doesNotMatch(page, /sendReportEmail|sendRefundEmail/);

    const webhook = await readSrc("app/api/stripe/webhook/route.ts");
    assert.match(webhook, /checkout\.session\.expired/);
    assert.match(webhook, /status: "expired"/);
    assert.doesNotMatch(webhook, /sendMail|sendReportEmail/);
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

  it("links a fulfilled order VIN to the same report URL as View report", async () => {
    assert.equal(orderReportHref("tok_abc"), "/report/tok_abc");

    const page = await readSrc("app/admin/page.tsx");
    const vin = await readSrc("app/admin/order-vin.tsx");
    const actions = await readSrc("app/admin/order-actions.tsx");
    const abandoned = await readSrc("app/admin/abandoned-checkouts.tsx");

    assert.match(page, /<OrderVin/);
    assert.match(vin, /orderReportHref\(accessToken\)/);
    assert.match(vin, /status !== "fulfilled"/);
    assert.match(vin, /target="_blank"/);
    assert.match(actions, /orderReportHref\(accessToken\)/);
    assert.match(actions, /View report/);
    assert.match(actions, /target="_blank"/);
    assert.doesNotMatch(abandoned, /OrderVin|orderReportHref|\/report\//);
  });
});

describe("unpaid checkout classification", () => {
  it("treats pending and expired as unpaid, everything else as money activity", () => {
    assert.equal(isUnpaidCheckoutStatus("pending"), true);
    assert.equal(isUnpaidCheckoutStatus("expired"), true);
    assert.equal(isUnpaidCheckoutStatus("paid"), false);
    assert.equal(isUnpaidCheckoutStatus("fulfilled"), false);
    assert.equal(isUnpaidCheckoutStatus("failed"), false);

    assert.equal(isMoneyActivityStatus("paid"), true);
    assert.equal(isMoneyActivityStatus("fulfilled"), true);
    assert.equal(isMoneyActivityStatus("failed"), true);
    assert.equal(isMoneyActivityStatus("pending"), false);
    assert.equal(isMoneyActivityStatus("expired"), false);
  });

  it("counts abandoned today and MTD on the Denver calendar", () => {
    const now = new Date("2026-09-12T18:00:00.000Z"); // 12:00 MDT
    const windows = unpaidCheckoutWindowCounts(
      [
        "2026-09-12T16:00:00.000Z", // today
        "2026-09-11T16:00:00.000Z", // yesterday, same month
        "2026-08-12T16:00:00.000Z", // previous month
        "2026-09-13T05:00:00.000Z", // Sep 12, 11:00 PM MDT
      ],
      now,
    );
    assert.equal(windows.today, 2);
    assert.equal(windows.month, 3);
  });

  it("computes fulfilled / (fulfilled + abandoned) conversion", () => {
    assert.equal(checkoutConversionPercent(0, 0), null);
    assert.equal(checkoutConversionPercent(3, 1), 75);
    assert.equal(checkoutConversionPercent(1, 1), 50);

    const empty = abandonedCheckoutStats({
      abandoned: 0,
      abandonedToday: 0,
      abandonedMonth: 0,
      fulfilled: 0,
    });
    assert.equal(empty.conversionPercent, null);
    assert.equal(empty.conversionLabel, "No checkouts yet");

    const mixed = abandonedCheckoutStats({
      abandoned: 2,
      abandonedToday: 1,
      abandonedMonth: 2,
      fulfilled: 6,
    });
    assert.equal(mixed.today, 1);
    assert.equal(mixed.month, 2);
    assert.equal(mixed.conversionPercent, 75);
    assert.equal(mixed.conversionLabel, "75% paid");
  });
});
