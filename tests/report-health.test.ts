import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  earliestSalvageIso,
  formatDuration,
  healthLabel,
  reportHealth,
  SALVAGE_SCORE_CAP,
  sortableDate,
} from "../src/lib/report-health.ts";
import type { Field, ReportSection, VehicleReport } from "../src/lib/report.ts";
import { buildSampleReport } from "../src/lib/sample-report.ts";

function fields(pairs: [string, string][]): Field[] {
  return pairs.map(([label, value]) => ({ label, value }));
}

function section(overrides: Partial<ReportSection>): ReportSection {
  return {
    key: "titles",
    title: "",
    description: "",
    emptyLabel: "",
    records: [],
    ...overrides,
  };
}

function report(overrides: Partial<VehicleReport> = {}): VehicleReport {
  return {
    vin: "4S3BWGN65M3012307",
    source: "vinaudit",
    isSample: false,
    generatedAt: "2026-09-08T12:00:00.000Z",
    vehicle: { year: "2021", make: "Subaru", model: "Outback" },
    headline: "",
    specifications: [],
    checks: [
      { key: "titles", label: "Title records", status: "found", count: 2, detail: "" },
      { key: "branded", label: "Branded title", status: "found", count: 1, detail: "" },
      { key: "accidents", label: "Accident records", status: "clear", count: 0, detail: "" },
      { key: "thefts", label: "Theft records", status: "clear", count: 0, detail: "" },
      { key: "liens", label: "Liens & repossessions", status: "clear", count: 0, detail: "" },
      { key: "impounds", label: "Impounds", status: "clear", count: 0, detail: "" },
      { key: "exports", label: "Export records", status: "clear", count: 0, detail: "" },
      { key: "recalls", label: "Open recalls", status: "clear", count: 0, detail: "" },
    ],
    odometer: [],
    sections: [],
    ...overrides,
  };
}

function recentCopart(): VehicleReport {
  return report({
    odometer: [
      { date: "2026-05-11", value: 84_200, unit: "mi", source: "CO" },
      { date: "2026-05-29", value: 84_310, unit: "mi", source: "CO" },
    ],
    sections: [
      section({
        key: "jsi",
        records: [
          fields([
            ["Date", "May 11, 2026"],
            ["Obtained from", "Copart"],
            ["Disposition", "Sold"],
          ]),
        ],
      }),
      section({
        key: "titles",
        records: [
          fields([
            ["Date", "May 29, 2026"],
            ["State", "CO"],
            ["Mileage", "84,310 mi"],
            ["Event", "Title issued"],
          ]),
          fields([
            ["Date", "May 11, 2026"],
            ["State", "CO"],
            ["Mileage", "84,200 mi"],
            ["Event", "Salvage"],
            ["Brand", "Salvage"],
          ]),
        ],
      }),
    ],
  });
}

function longPostSalvage(): VehicleReport {
  return report({
    odometer: [
      { date: "2018-04-02", value: 41_000, unit: "mi", source: "TN" },
      { date: "2018-06-01", value: 42_200, unit: "mi", source: "TN" },
      { date: "2021-09-15", value: 78_400, unit: "mi", source: "TN" },
      { date: "2024-09-27", value: 112_000, unit: "mi", source: "TN" },
    ],
    sections: [
      section({
        key: "jsi",
        records: [
          fields([
            ["Date", "Apr 2, 2018"],
            ["Obtained from", "Copart"],
            ["Disposition", "Sold"],
          ]),
        ],
      }),
      section({
        key: "titles",
        records: [
          fields([
            ["Date", "Sep 27, 2024"],
            ["Mileage", "112,000 mi"],
            ["Event", "Title transfer"],
          ]),
          fields([
            ["Date", "Jun 1, 2018"],
            ["Mileage", "42,200 mi"],
            ["Event", "Rebuilt title"],
            ["Brand", "Rebuilt"],
          ]),
        ],
      }),
    ],
  });
}

describe("sortable record dates", () => {
  it("reads ISO, packed and titled dates the same way", () => {
    assert.equal(sortableDate("2026-05-11"), "2026-05-11");
    assert.equal(sortableDate("20260511"), "2026-05-11");
    assert.equal(sortableDate("May 11, 2026"), "2026-05-11");
    assert.equal(sortableDate("5/11/2026"), "2026-05-11");
  });
});

describe("report health", () => {
  it("scores the sample from its records and never calls it a value or a grade of the car", () => {
    const health = reportHealth(buildSampleReport());
    assert.equal(health.score >= 80, true);
    assert.equal(health.label, "Strong");
    assert.match(health.disclaimer, /not an appraisal/i);
    assert.doesNotMatch(health.disclaimer, /market value of this car|condition of this VIN/i);
    assert.equal(health.salvage.present, false);
    assert.equal(health.factors.some((factor) => factor.key === "post-salvage"), false);
    assert.equal(
      health.factors.find((factor) => factor.key === "accidents")?.impact,
      "hurts",
    );
    assert.equal(
      health.factors.find((factor) => factor.key === "liens")?.impact,
      "hurts",
    );
    assert.match(
      health.factors.find((factor) => factor.key === "liens")?.reason ?? "",
      /released/i,
    );
    for (const factor of health.factors) {
      assert.doesNotMatch(factor.reason, /\breliable\b|appraised|worth \$/i);
    }
  });

  it("treats a May 2026 Copart row plus a title 18 days later as too early", () => {
    const paid = recentCopart();
    assert.equal(earliestSalvageIso(paid), "2026-05-11");
    const health = reportHealth(paid);
    assert.equal(health.salvage.present, true);
    assert.equal(health.salvage.post, "short");
    const after = health.factors.find((factor) => factor.key === "post-salvage");
    assert.ok(after);
    assert.equal(after.impact, "neutral");
    assert.equal(after.delta, 0);
    assert.match(after.reason, /May 11, 2026/);
    assert.match(after.reason, /too early/i);
    assert.doesNotMatch(after.reason, /years after|rising from/i);
    assert.doesNotMatch(after.reason, /\breliable\b/i);
    assert.equal(health.factors.find((factor) => factor.key === "salvage")?.impact, "hurts");
    assert.equal(health.score <= SALVAGE_SCORE_CAP, true);
    assert.equal(health.label, "Caution");
  });

  it("cannot render salvage as Strong, even after the post-salvage bonus", () => {
    const health = reportHealth(longPostSalvage());
    const after = health.factors.find((factor) => factor.key === "post-salvage");
    assert.ok(after);
    assert.equal(after.delta, 8);
    assert.equal(health.score <= SALVAGE_SCORE_CAP, true);
    assert.equal(health.label, "Caution");
    assert.notEqual(health.label, "Strong");
    assert.equal(health.score < 55, true);
  });

  it("credits later climbing mileage after a year of post-salvage records, as facts only", () => {
    const health = reportHealth(longPostSalvage());
    assert.equal(health.salvage.post, "long");
    const after = health.factors.find((factor) => factor.key === "post-salvage");
    assert.ok(after);
    assert.equal(after.impact, "helps");
    assert.equal(after.delta, 8);
    assert.match(after.reason, /continue for .+ after the salvage-channel entry/i);
    assert.match(after.reason, /rising from 42,200 mi to 112,000 mi/);
    assert.doesNotMatch(after.reason, /\breliable\b|repaired|restored/i);
  });

  it("still scores a thin report and says the history is thin", () => {
    const health = reportHealth(
      report({
        checks: [
          { key: "titles", label: "Title records", status: "clear", count: 0, detail: "" },
        ],
        sections: [section({ key: "titles", records: [] })],
        odometer: [],
      }),
    );
    const titles = health.factors.find((factor) => factor.key === "titles");
    assert.equal(health.score >= 0 && health.score <= 100, true);
    assert.equal(titles?.delta, -8);
    assert.match(titles?.reason ?? "", /thin/i);
  });

  it("labels bands without using a market-value word", () => {
    assert.equal(healthLabel(92), "Strong");
    assert.equal(healthLabel(70), "Mixed");
    assert.equal(healthLabel(40), "Caution");
  });

  it("prints short spans in days or months, not years", () => {
    assert.equal(formatDuration(18), "18 days");
    assert.match(formatDuration(200), /month/);
    assert.equal(formatDuration(400), "1 year");
  });
});
