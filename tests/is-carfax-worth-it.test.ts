import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function readSrc(relative: string) {
  return readFile(new URL(relative, `file://${SRC}`), "utf8");
}

describe("/is-carfax-worth-it", () => {
  it("is a public marketing page with the 2026 H1 and honest sections", async () => {
    const page = await readSrc("app/is-carfax-worth-it/page.tsx");

    assert.match(page, /Is Carfax Worth It in 2026\? \(Honest Comparison\)/);
    assert.match(page, /TL;DR/);
    assert.match(page, /What Carfax is good at/);
    assert.match(page, /What every report misses/);
    assert.match(page, /NMVTIS explained/);
    assert.match(page, /Price comparison/);
    assert.match(page, /Decision tree/);
    assert.match(page, /How \{BRAND\.shortName\} fits/);
    assert.match(page, /id="faq"/);
    assert.match(page, /export const dynamic = "force-dynamic"/);
    assert.match(page, /alternates: \{ canonical: PATH \}/);
    assert.match(page, /application\/ld\+json/);
    assert.match(page, /"@type": "FAQPage"/);
  });

  it("prices our report through formatPrice() and never hardcodes $14.99", async () => {
    const page = await readSrc("app/is-carfax-worth-it/page.tsx");
    assert.match(page, /const price = formatPrice\(\)/);
    assert.match(page, /One payment of \$\{price\} buys one report for one VIN/);
    assert.doesNotMatch(page, /\$14\.99/);
    assert.doesNotMatch(page, /\$19\.99/);
    assert.doesNotMatch(page, /1499/);
  });

  it("labels competitor prices as typical ranges", async () => {
    const page = await readSrc("app/is-carfax-worth-it/page.tsx");
    assert.match(page, /typically about \$40–\$45/);
    assert.match(page, /typically about \$60–\$110 for a pack/);
    assert.match(page, /typically about \$25/);
    assert.match(page, /NICB VINCheck/);
    assert.match(page, /NHTSA recall lookup/);
    assert.match(page, /typically free/);
    assert.match(page, /Best for/);
    assert.match(page, /Watch-outs/);
    assert.match(page, /Typical retail ranges, not a live price list/);
    assert.equal(
      page.match(/typically about \$/g)?.length,
      3,
      "every paid competitor price cell should say typically",
    );
  });

  it("keeps CTAs soft: sample report and homepage VIN checkout", async () => {
    const page = await readSrc("app/is-carfax-worth-it/page.tsx");
    assert.match(page, /href="\/sample"/);
    assert.match(page, /See a free sample report/);
    assert.match(page, /Check a VIN — \{price\}/);
    assert.match(page, /<StartReportLink/);
    assert.match(page, /<VinForm variant="on-light"/);
    assert.match(page, /<SampleTeaser/);
    assert.doesNotMatch(page, /GoogleAdsPurchase|VQOrCJabp_IcEJPRqdlE/);
    assert.doesNotMatch(page, /Get my report ·/);
  });

  it("stays legally honest: clean report, PPI, no affiliation, no fake reviews", async () => {
    const page = await readSrc("app/is-carfax-worth-it/page.tsx");
    assert.match(page, /NHTSA 5-Star/);
    assert.match(page, /EPA ownership/);
    assert.match(page, /A clean report is not a clean car/);
    assert.match(page, /pre-purchase inspection/);
    assert.match(page, /We are not affiliated with Carfax or AutoCheck/);
    assert.match(page, /not affiliated with, endorsed by, or sponsored by/);
    assert.match(page, /without a fake review/);
    assert.doesNotMatch(page, /★★|⭐|5\/5|John from|verified buyer|customer review/i);
    assert.doesNotMatch(page, /PullVinReport|Pull Vin Report|pullvinreport\.com/i);
    assert.doesNotMatch(page, /(?<![\w/])vinaudit(?!\w)/i);
  });

  it("is indexed on the sitemap and linked from the public footer and homepage", async () => {
    const sitemap = await readSrc("app/sitemap.ts");
    const footer = await readSrc("components/site-footer.tsx");
    const home = await readSrc("app/page.tsx");

    assert.match(sitemap, /\/is-carfax-worth-it/);
    assert.match(footer, /href: "\/is-carfax-worth-it"/);
    assert.match(home, /href="\/is-carfax-worth-it"/);
  });
});
