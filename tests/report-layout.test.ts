import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withCurrentLayout } from "@/lib/report-layout";
import type { VehicleReport } from "@/lib/report";
import { buildSampleReport } from "@/lib/sample-report";
import { normalizeVinAuditReport } from "@/lib/vinaudit";

const VIN = "4T1BF1FK8CU512345";

const PAYLOAD = {
  attributes: { Year: "2012", Make: "Toyota", Model: "Camry" },
  titles: [
    {
      vin: VIN,
      date: "2024-09-27",
      state: "TN",
      meter: "121477",
      meterunit: "M",
      current: true,
    },
    {
      vin: VIN,
      date: "2019-03-08",
      state: "TN",
      meter: "78930",
      meterunit: "M",
      current: false,
    },
  ],
};

/** A report as an older release would have stored it: VIN on every record. */
function storedUnderOldLayout(): VehicleReport {
  return {
    ...normalizeVinAuditReport(PAYLOAD, VIN),
    generatedAt: "2026-02-01T10:00:00.000Z",
    sections: [
      {
        key: "titles",
        title: "Title & registration history",
        description: "",
        emptyLabel: "",
        records: [
          [
            { label: "VIN", value: VIN },
            { label: "Date", value: "Sep 27, 2024" },
            { label: "Odometer unit", value: "M" },
          ],
        ],
      },
    ],
    raw: PAYLOAD,
  };
}

describe("re-laying out a stored report", () => {
  it("rebuilds the records from the payload kept with the order", () => {
    const laid = withCurrentLayout(storedUnderOldLayout());
    const titles = laid.sections.find((section) => section.key === "titles");

    assert.ok(titles);
    for (const record of titles.records) {
      for (const field of record) {
        assert.notEqual(field.label, "VIN");
        assert.notEqual(field.value, VIN);
        assert.doesNotMatch(field.label, /unit/i);
      }
    }
    assert.equal(titles.navLabel, "Titles & mileage");
    assert.equal(titles.title, "Title, registration & mileage");
  });

  it("keeps saying when the report was generated, not when it was re-laid out", () => {
    assert.equal(
      withCurrentLayout(storedUnderOldLayout()).generatedAt,
      "2026-02-01T10:00:00.000Z",
    );
  });

  it("leaves the report alone when no payload was stored with it", () => {
    const stored = { ...storedUnderOldLayout(), raw: undefined };
    assert.deepEqual(withCurrentLayout(stored), stored);
  });

  it("never rebuilds the sample as if it were a purchased report", () => {
    const sample = buildSampleReport();
    assert.deepEqual(withCurrentLayout(sample), sample);
  });

  it("falls back to what was stored when the payload no longer parses", () => {
    const stored = { ...storedUnderOldLayout(), raw: "not a payload" };
    assert.deepEqual(withCurrentLayout(stored), stored);
  });
});
