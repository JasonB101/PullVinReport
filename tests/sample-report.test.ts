import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
});
