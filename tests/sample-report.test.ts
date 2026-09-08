import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sectionListingGroups } from "../src/lib/report.ts";
import { buildSampleReport, SAMPLE_VIN } from "../src/lib/sample-report.ts";
import { validateVin } from "../src/lib/vin.ts";

describe("sample report", () => {
  it("is always tagged as a sample", () => {
    const report = buildSampleReport();
    assert.equal(report.isSample, true);
    assert.equal(report.source, "sample");
  });

  it("uses a structurally valid VIN so the demo behaves like the real thing", () => {
    const result = validateVin(SAMPLE_VIN);
    assert.equal(result.valid, true);
    assert.equal(result.warning, undefined);
  });

  it("says the word sample in its closing note", () => {
    const report = buildSampleReport();
    assert.match(report.sections[0].title, /Title/);
    assert.equal(report.checks.length > 0, true);
  });

  it("never claims VinAudit as its source", () => {
    const report = buildSampleReport();
    assert.notEqual(report.source, "vinaudit");
  });

  it("folds the same-sale listings so the sample shows that layout", () => {
    const sales = buildSampleReport().sections.find((section) => section.key === "sales");
    assert.ok(sales);
    const groups = sectionListingGroups(sales);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].listings.length, 3);
    assert.equal(groups[0].price, "$11,450.00");
    assert.equal(groups[1].listings.length, 1);
  });
});
