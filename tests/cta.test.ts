import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));

describe("priced CTAs", () => {
  it("start a report at the homepage VIN form, not the lost-order page", async () => {
    const start = await readFile(`${root}components/start-report-link.tsx`, "utf8");
    assert.match(start, /START_HREF = "\/#vin"/);
    assert.doesNotMatch(start, /href="\/lookup"/);
  });

  it("does not pitch a price on a report the buyer already paid for", async () => {
    const report = await readFile(`${root}app/report/[token]/page.tsx`, "utf8");
    assert.match(report, /cta="another"/);
    assert.doesNotMatch(report, /<SiteHeader \/>/);

    const success = await readFile(`${root}app/order/success/page.tsx`, "utf8");
    assert.match(success, /cta="none"/);
  });

  it("wires the header's VIN-start button through the link that actually scrolls", async () => {
    const header = await readFile(`${root}components/site-header.tsx`, "utf8");
    assert.match(header, /StartReportLink/);
    assert.match(header, /Check a VIN/);
    assert.match(header, /Buy another report/);
    assert.doesNotMatch(header, /Get a report/);
  });
});
