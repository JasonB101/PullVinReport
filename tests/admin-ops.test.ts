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
});
