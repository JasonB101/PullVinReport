import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReportSection } from "../src/lib/report.ts";
import {
  dedupeConsecutiveRecords,
  formatEventDate,
  isoDate,
  sectionTable,
} from "../src/lib/report.ts";

function section(overrides: Partial<ReportSection>): ReportSection {
  return {
    key: "titles",
    title: "Title & registration history",
    description: "",
    emptyLabel: "",
    records: [],
    ...overrides,
  };
}

describe("event dates", () => {
  it("accepts the formats states actually send", () => {
    assert.equal(isoDate("2024-09-27"), "2024-09-27");
    assert.equal(isoDate("20240927"), "2024-09-27");
    assert.equal(isoDate("9/27/2024"), "2024-09-27");
    assert.equal(isoDate("2024-09-27T12:00:00Z"), "2024-09-27");
  });

  it("says so rather than guessing when it cannot parse one", () => {
    assert.equal(isoDate("sometime in 2024"), "");
    assert.equal(isoDate(""), "");
  });

  it("prints a parsed date and leaves anything else alone", () => {
    assert.equal(formatEventDate("2024-09-27"), "Sep 27, 2024");
    assert.equal(formatEventDate("20120402"), "Apr 2, 2012");
    assert.equal(formatEventDate("sometime in 2024"), "sometime in 2024");
  });
});

describe("section tables", () => {
  it("lays records out against the columns that are actually filled in", () => {
    const table = sectionTable(
      section({
        columns: ["Date", "State", "Odometer", "Current"],
        records: [
          [
            { label: "Date", value: "Sep 27, 2024" },
            { label: "State", value: "TN" },
            { label: "Odometer", value: "121,477 mi" },
            { label: "Current", value: "Yes" },
            { label: "Vehicle use", value: "Personal" },
          ],
        ],
      }),
    );

    assert.ok(table);
    // "Current" is filled in, so it stays; every column here has a value.
    assert.deepEqual(table.columns, ["Date", "State", "Odometer", "Current"]);
    assert.deepEqual(table.rows[0].cells, [
      "Sep 27, 2024",
      "TN",
      "121,477 mi",
      "Yes",
    ]);
    assert.deepEqual(table.rows[0].extras, [
      { label: "Vehicle use", value: "Personal" },
    ]);
  });

  it("drops a column no record filled in rather than printing dashes", () => {
    const table = sectionTable(
      section({
        columns: ["Date", "State", "Odometer", "Current"],
        records: [
          [
            { label: "Date", value: "Sep 27, 2024" },
            { label: "State", value: "TN" },
          ],
          [
            { label: "Date", value: "Mar 8, 2019" },
            { label: "State", value: "KY" },
          ],
        ],
      }),
    );

    assert.ok(table);
    assert.deepEqual(table.columns, ["Date", "State"]);
  });

  it("falls back to cards when the records share almost nothing", () => {
    assert.equal(
      sectionTable(
        section({
          columns: ["Date", "State"],
          records: [[{ label: "Summary", value: "A long recall description" }]],
        }),
      ),
      null,
    );
  });

  it("falls back to cards for a section that declares no columns", () => {
    assert.equal(
      sectionTable(
        section({ records: [[{ label: "Campaign", value: "14V-651" }]] }),
      ),
      null,
    );
  });
});

describe("de-duplication", () => {
  it("collapses a record that repeats the one before it", () => {
    const record = [
      { label: "Date", value: "Sep 27, 2024" },
      { label: "State", value: "TN" },
    ];
    assert.equal(dedupeConsecutiveRecords([record, [...record]]).length, 1);
  });

  it("keeps a genuine repeat event that is separated by another", () => {
    const tennessee = [{ label: "State", value: "TN" }];
    const kentucky = [{ label: "State", value: "KY" }];
    assert.equal(
      dedupeConsecutiveRecords([tennessee, kentucky, [...tennessee]]).length,
      3,
    );
  });

  it("keeps records that differ in any single field", () => {
    assert.equal(
      dedupeConsecutiveRecords([
        [
          { label: "Date", value: "Sep 27, 2024" },
          { label: "Odometer", value: "121,477 mi" },
        ],
        [
          { label: "Date", value: "Sep 27, 2024" },
          { label: "Odometer", value: "121,480 mi" },
        ],
      ]).length,
      2,
    );
  });
});
