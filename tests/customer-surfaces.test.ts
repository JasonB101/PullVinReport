import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Guards the decision that a buyer never reads the name of the company we buy
 * records from. It is the kind of thing that creeps back one helpful sentence
 * at a time, so the rule is enforced against the files rather than trusted to
 * review.
 */
/**
 * Matches the supplier as a word a customer could read, not as part of an
 * identifier (`isVinAuditConfigured`) or an import path (`@/lib/vinaudit`),
 * both of which are internals the rule was never about.
 */
const SUPPLIER = /(?<![\w/])vinaudit(?!\w)/i;

/** Marketing credit and API jargon a buyer has no use for. */
const JARGON =
  /powered by\s+vinaudit|vinaudit\s+api|via our api|data source:\s*vinaudit/i;

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

/**
 * Where naming the supplier is legitimate.
 *
 * Operator surfaces need it to say which dependency is down. The modules that
 * talk to it are named after it. Privacy and marketing pages are not on this
 * list — buyers read those.
 */
const ALLOWED = [
  "app/admin/",
  "app/status/",
  "app/api/checkout/route.ts",
  "app/api/status/route.ts",
  "lib/config.ts",
  "lib/fulfillment.ts",
  "lib/status.ts",
  "lib/vinaudit.ts",
  "lib/vendor-credits.ts",
  "lib/report.ts",
  "lib/store/types.ts",
];

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    }),
  );
  return files.flat();
}

function readSrc(relative: string) {
  return readFile(path.join(SRC, relative), "utf8");
}

describe("customer-facing surfaces", () => {
  it("never name the company we buy records from", async () => {
    const offenders: string[] = [];

    for (const file of await sourceFiles(SRC)) {
      const relative = path.relative(SRC, file).replaceAll(path.sep, "/");
      if (ALLOWED.some((allowed) => relative.startsWith(allowed))) continue;

      const contents = await readFile(file, "utf8");
      for (const [index, line] of contents.split("\n").entries()) {
        if (SUPPLIER.test(line)) offenders.push(`${relative}:${index + 1}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `these files are customer-facing and must not name the supplier:\n${offenders.join("\n")}`,
    );
  });

  it("keeps the operator surfaces that do name it", async () => {
    // The point of the rule is that the name is hidden from buyers, not
    // scrubbed from the codebase — an operator still has to be able to tell
    // which dependency is failing.
    const status = await readSrc("lib/status.ts");
    assert.match(status, SUPPLIER);
    const adminStatus = await readSrc("app/status/page.tsx");
    assert.match(adminStatus, SUPPLIER);
  });

  it("does not credit the wholesale vendor in privacy or marketing copy", async () => {
    const privacy = await readSrc("app/privacy/page.tsx");
    assert.doesNotMatch(privacy, SUPPLIER);
    assert.match(privacy, /vehicle history[\s\S]*data providers/);

    const home = await readSrc("app/page.tsx");
    assert.match(
      home,
      /Every purchased report is pulled live at the moment you buy it, from national title and brand data reported to NMVTIS together with insurance, salvage, auction and listing records\./,
    );
    const resellRepackage =
      /We do not resell another retailer's report and we do not repackage the sample\./;
    assert.doesNotMatch(home, resellRepackage);
    const advertisedRefund =
      /email (us|support) and we will refund you|can.?t return a report for your VIN|for a refund/i;
    assert.doesNotMatch(home, advertisedRefund);
    const preview = await readSrc("app/preview/page.tsx");
    const disclaimerCopy = await readSrc("app/disclaimer/page.tsx");
    assert.doesNotMatch(preview, advertisedRefund);
    assert.doesNotMatch(disclaimerCopy, advertisedRefund);

    const layout = await readSrc("app/layout.tsx");
    assert.doesNotMatch(layout, /NMVTIS/);

    const terms = await readSrc("app/terms/page.tsx");
    const disclaimer = await readSrc("app/disclaimer/page.tsx");
    const email = await readSrc("lib/email.ts");
    const pdf = await readSrc("lib/report-pdf.tsx");
    for (const [name, source] of [
      ["home", home],
      ["terms", terms],
      ["disclaimer", disclaimer],
      ["email", email],
      ["pdf", pdf],
    ] as const) {
      assert.doesNotMatch(source, SUPPLIER, name);
      assert.doesNotMatch(source, JARGON, name);
      assert.doesNotMatch(source, resellRepackage, name);
    }
  });

  it("does not link public visitors to /status", async () => {
    const footer = await readSrc("components/site-footer.tsx");
    const header = await readSrc("components/site-header.tsx");
    const checkout = await readSrc("components/checkout-panel.tsx");
    const home = await readSrc("app/page.tsx");
    assert.doesNotMatch(footer, /href=["']\/status["']/);
    assert.doesNotMatch(header, /\/status/);
    assert.doesNotMatch(checkout, /href=["']\/status["']/);
    assert.doesNotMatch(home, /href=["']\/status["']/);
    assert.doesNotMatch(footer, /href=["']\/admin/);
    assert.doesNotMatch(header, /href=["']\/admin/);
    assert.doesNotMatch(home, /href=["']\/admin/);
  });

  it("gates /status behind the same admin session as /admin", async () => {
    const page = await readSrc("app/status/page.tsx");
    assert.match(page, /isAdminAuthenticated/);
    assert.match(page, /redirect\("\/admin\/login"\)/);
    assert.match(page, /robots:\s*\{\s*index:\s*false/);

    const robots = await readSrc("app/robots.ts");
    assert.match(robots, /"\/status"/);
  });

  it("keeps anonymous /api/status free of provider names", async () => {
    const route = await readSrc("app/api/status/route.ts");
    assert.match(route, /isAdminAuthenticated/);
    assert.match(route, /ordersEnabled: report\.ordersEnabled/);
    assert.doesNotMatch(route, /VinAudit Vehicle History API/);
  });

  it("does not show the retired PullVinReport brand to buyers", async () => {
    const RETIRED = /PullVinReport|Pull Vin Report|pullvinreport\.com/i;
    const files = [
      "app/layout.tsx",
      "app/page.tsx",
      "app/privacy/page.tsx",
      "app/terms/page.tsx",
      "app/disclaimer/page.tsx",
      "app/is-carfax-worth-it/page.tsx",
      "app/admin/login/page.tsx",
      "components/logo.tsx",
      "components/site-footer.tsx",
      "components/download-pdf-button.tsx",
      "lib/email.ts",
      "lib/report-pdf.tsx",
      "lib/stripe.ts",
      "lib/status.ts",
    ];
    for (const file of files) {
      assert.doesNotMatch(await readSrc(file), RETIRED, file);
    }
  });

  it("does not expose vendor credit balances on customer surfaces", async () => {
    const home = await readSrc("app/page.tsx");
    const footer = await readSrc("components/site-footer.tsx");
    const header = await readSrc("components/site-header.tsx");
    const preview = await readSrc("app/preview/page.tsx");
    const publicStatus = await readSrc("app/api/status/route.ts");
    for (const [name, source] of [
      ["home", home],
      ["footer", footer],
      ["header", header],
      ["preview", preview],
      ["api/status", publicStatus],
    ] as const) {
      assert.doesNotMatch(source, /API credits/, name);
      assert.doesNotMatch(source, /fetchVendorCredits/, name);
      assert.doesNotMatch(source, /vendor-credits/, name);
      assert.doesNotMatch(source, /Console Billing/, name);
      assert.doesNotMatch(source, /console\.anthropic\.com/, name);
      assert.doesNotMatch(source, /Ads spend/, name);
      assert.doesNotMatch(source, /GOOGLE_ADS_REFRESH_TOKEN/, name);
    }
  });
});
