import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hasModelExtras } from "../src/lib/model-extras.ts";
import {
  groupSpecFields,
  headerSpecifications,
  partitionSpecMpg,
  sectionListingGroups,
} from "../src/lib/report.ts";
import {
  buildSampleModelExtras,
  buildSampleReport,
  SAMPLE_VIN,
} from "../src/lib/sample-report.ts";
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

  it("ships a stable Also-for-this-model fixture that is not this VIN", () => {
    const extras = buildSampleModelExtras();
    assert.equal(hasModelExtras(extras), true);
    assert.equal(extras.ymmLabel, "2012 Toyota Camry");
    assert.equal(extras.recalls?.total, 2);
    assert.ok((extras.complaints?.total ?? 0) > 0);
    assert.ok((extras.complaints?.samples.length ?? 0) >= 3);
    assert.ok((extras.complaints?.samples[0]?.summary.length ?? 0) > 40);
    assert.equal(extras.mpg?.city, 24);
    assert.equal(JSON.stringify(extras).includes(SAMPLE_VIN), false);
  });

  it("surfaces Super White from the listing rows on the vehicle card", () => {
    const specs = headerSpecifications(buildSampleReport());
    assert.deepEqual(specs[0], { label: "Color", value: "Super White" });
    const { mpg, rest } = partitionSpecMpg(specs);
    assert.deepEqual(mpg?.figures.map((row) => row.display), ["24", "34"]);
    assert.equal(
      specs.some((field) => field.label === "Interior colour" || /ivory|ash/i.test(field.value)),
      false,
    );
    assert.deepEqual(
      groupSpecFields(rest).map((group) => group.key),
      ["powertrain", "body", "features"],
    );
  });

  it("folds sister rooftops into listing chapters so the sample shows that layout", () => {
    const sales = buildSampleReport().sections.find((section) => section.key === "sales");
    assert.ok(sales);
    assert.match(sales.description, /not confirmed sales/);
    const groups = sectionListingGroups(sales);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].listings.length, 3);
    assert.equal(groups[0].price, "$11,450");
    assert.match(groups[0].identity, /Music City/);
    assert.doesNotMatch(groups[0].identity, /Honda|Toyota/);
    assert.equal(groups[1].listings.length, 1);
    assert.equal(groups[1].price, "$9,995");
  });
});
