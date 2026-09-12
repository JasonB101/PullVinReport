import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withCurrentLayout } from "@/lib/report-layout";
import type { VehicleReport } from "@/lib/report";
import { reportChips, titleHistoryStatus } from "@/lib/report";
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

  it("rebuilds the Beetle IAA fixture as branded and drops same-day TBD", () => {
    const vin = "3VW5DAAT4JM515636";
    const raw = {
      clean: false,
      attributes: { Year: "2018", Make: "Volkswagen", Model: "Beetle" },
      titles: [{ vin, date: "2026-07-07", state: "CA", meter: "76251", current: true }],
      jsi: [
        { date: "2026-06-03", brander_name: "IAA", vehicle_disposition: "SOLD", intended_for_export: "Y" },
        {
          date: "2026-06-03",
          brander_name: "IAA",
          vehicle_disposition: "TO BE DETERMINED",
          intended_for_export: "N",
        },
      ],
      salvage: [{ vin, date: "2026-07-09", type: "salvage" }],
      checks: [
        {
          date: "2026-07-07",
          brand_code: "11",
          brand_title: "Salvage: Damage or Not Specified",
          brander_name: "CALIFORNIA",
        },
      ],
    };
    const stored: VehicleReport = {
      ...normalizeVinAuditReport({ attributes: raw.attributes, titles: raw.titles }, vin),
      generatedAt: "2026-09-12T16:02:47.797Z",
      headline: "Junk, salvage or insurance-loss activity was reported for this VIN.",
      checks: [
        { key: "titles", label: "Title records", status: "found", count: 1, detail: "" },
        { key: "branded", label: "Branded title", status: "clear", count: 0, detail: "" },
        { key: "jsi", label: "Junk & salvage", status: "found", count: 2, detail: "" },
      ],
      sections: [
        {
          key: "titles",
          title: "Title, registration & mileage",
          description: "",
          emptyLabel: "",
          records: [[{ label: "Date", value: "Jul 7, 2026" }, { label: "State", value: "CA" }]],
        },
        {
          key: "jsi",
          title: "Junk, salvage & insurance records",
          navLabel: "Junk & salvage",
          description: "",
          emptyLabel: "",
          records: [
            [
              { label: "Date", value: "Jun 3, 2026" },
              { label: "Vehicle disposition", value: "Sold" },
            ],
            [
              { label: "Date", value: "Jun 3, 2026" },
              { label: "Vehicle disposition", value: "To be determined" },
            ],
          ],
        },
      ],
      raw,
    };

    const laid = withCurrentLayout(stored);
    const jsi = laid.sections.find((section) => section.key === "jsi");
    assert.equal(titleHistoryStatus(laid), "branded");
    assert.ok(reportChips(laid).some((chip) => chip.label === "Branded title"));
    assert.ok(jsi && jsi.records.length >= 1);
    assert.equal(
      jsi.records.some((record) =>
        record.some((field) => /to be determined|^tbd$/i.test(field.value)),
      ),
      false,
    );
    assert.ok(
      jsi.records.some((record) => record.some((field) => /^sold$/i.test(field.value))),
    );
  });
});
