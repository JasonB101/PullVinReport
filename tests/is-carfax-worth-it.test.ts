import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function readSrc(relative: string) {
  return readFile(new URL(relative, `file://${SRC}`), "utf8");
}

describe("Is Carfax worth it SEO page", () => {
  it("ships the route with honest comparison copy, CTAs, sitemap, and footer", async () => {
    const page = await readSrc("app/is-carfax-worth-it/page.tsx");
    const sitemap = await readSrc("app/sitemap.ts");
    const footer = await readSrc("components/site-footer.tsx");

    assert.match(page, /<h1[^>]*>\s*Is Carfax Worth It in 2026\?\s*<\/h1>/);
    assert.match(
      page,
      /TITLE = "Is Carfax Worth It in 2026\? Honest Comparison \| Vehicle History by VIN"/,
    );
    assert.match(page, /title: \{ absolute: TITLE \}/);
    assert.match(page, /Carfax isn’t the only vehicle history report/);
    assert.match(page, /What Carfax is good at/);
    assert.match(page, /What every report misses/);
    assert.match(page, /NMVTIS in plain English/);
    assert.match(page, /Price comparison/);
    assert.match(page, /Typical price/);
    assert.match(page, /Decision tree/);
    assert.match(page, /Is a cheaper report fake\?/);
    assert.match(page, /What’s the #1 step people skip\?/);
    assert.match(page, /Carfax alternative/);
    assert.match(page, /cheap VIN check/);
    assert.match(page, /vehicle history report comparison/);

    assert.match(page, /SiteHeader/);
    assert.match(page, /SiteFooter/);
    assert.match(page, /See free sample/);
    assert.match(page, /href="\/sample"/);
    assert.match(page, /Check a VIN — \{formatPrice\(\)\}/);
    assert.match(page, /StartReportLink/);
    assert.match(page, /href="\/#how-it-works"/);
    assert.match(page, /href="\/disclaimer"/);
    assert.doesNotMatch(page, /href="\/how-it-works"/);

    assert.match(page, /formatPrice\(\)/);
    assert.doesNotMatch(page, /\$14\.99/);
    assert.match(page, /~\$40–45 typical/);
    assert.match(page, /~\$25–30 typical/);
    assert.match(page, /Prices move — always check the provider/);
    assert.match(page, /does not sell official Carfax/);
    assert.match(page, /No subscription/);
    assert.match(page, /No report replaces a PPI/);

    assert.doesNotMatch(page, /PullVinReport|pullvinreport/i);
    assert.doesNotMatch(page, /100% of damage|beats? Carfax|Carfax is a scam/i);
    assert.doesNotMatch(page, /official Carfax report for sale/i);
    assert.doesNotMatch(page, /fake review|“I saved \$[0-9]/i);

    assert.match(sitemap, /\/is-carfax-worth-it/);
    assert.match(sitemap, /priority:\s*0\.75/);
    assert.match(footer, /href: "\/is-carfax-worth-it"/);
    assert.match(footer, /Is Carfax worth it\?/);
  });
});
