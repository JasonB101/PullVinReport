import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sectionListings, sectionTable } from "@/lib/report";
import type { ReportSection } from "@/lib/report";
import { normalizeVinAuditReport } from "@/lib/vinaudit";

const VIN = "4T1BF1FK8CU512345";

/** Shaped like the payload the provider returns, warts included. */
const PAYLOAD = {
  attributes: { Year: "2012", Make: "Toyota", Model: "Camry", Trim: "SE" },
  reportlink: "https://provider.example/report/abc123",
  titles: [
    {
      vin: VIN,
      date: "2015-06-19",
      state: "KY",
      meter: "41204",
      meterunit: "M",
      current: false,
      vehicleuse: "Personal",
    },
    {
      vin: VIN,
      date: "2024-09-27",
      state: "TN",
      meter: "121477",
      meterunit: "M",
      current: true,
      vehicleuse: "Personal",
    },
    // The same event echoed a second time, as some feeds do.
    {
      vin: VIN,
      date: "2024-09-27",
      state: "TN",
      meter: "121477",
      meterunit: "M",
      current: true,
      vehicleuse: "Personal",
    },
    {
      vin: VIN,
      date: "2019-03-08",
      state: "TN",
      meter: "78930",
      meterunit: "M",
      current: false,
      vehicleuse: "Personal",
    },
  ],
};

function find(sections: ReportSection[], key: string): ReportSection {
  const section = sections.find((candidate) => candidate.key === key);
  assert.ok(section, `expected a "${key}" section`);
  return section;
}

describe("provider report normalization", () => {
  const report = normalizeVinAuditReport(PAYLOAD, VIN);
  const titles = find(report.sections, "titles");

  it("never repeats the VIN on a record", () => {
    for (const record of titles.records) {
      assert.equal(
        record.some((field) => field.label === "VIN" || field.value === VIN),
        false,
      );
    }
  });

  it("keeps the provider's own report link off the customer's copy", () => {
    for (const section of report.sections) {
      for (const record of section.records) {
        for (const field of record) {
          assert.doesNotMatch(field.value, /provider\.example/);
        }
      }
    }
  });

  it("folds the odometer and its unit code into one readable value", () => {
    const odometer = titles.records[0].find(
      (field) => field.label === "Mileage",
    );
    assert.deepEqual(odometer, { label: "Mileage", value: "121,477 mi" });
  });

  it("reads flags as Yes and No rather than true and false", () => {
    const current = titles.records[0].find((field) => field.label === "Current");
    assert.deepEqual(current, { label: "Current", value: "Yes" });
  });

  it("orders events newest first", () => {
    assert.deepEqual(
      titles.records.map(
        (record) => record.find((field) => field.label === "Date")?.value,
      ),
      ["Sep 27, 2024", "Mar 8, 2019", "Jun 19, 2015"],
    );
  });

  it("collapses the echoed duplicate but keeps every real event", () => {
    assert.equal(PAYLOAD.titles.length, 4);
    assert.equal(titles.records.length, 3);
  });

  it("lays titles out as a table of the fields that matter", () => {
    const table = sectionTable(titles);
    assert.ok(table);
    assert.deepEqual(table.columns, ["Date", "State", "Mileage", "Current"]);
    assert.deepEqual(table.rows[0].cells, [
      "Sep 27, 2024",
      "TN",
      "121,477 mi",
      "Yes",
    ]);
    // The vehicle use is identical on every record, so it is not on the rows.
    assert.deepEqual(table.rows[0].extras, []);
  });

  it("states a value the feed repeats on every record once for the section", () => {
    assert.deepEqual(titles.shared, [{ label: "Vehicle use", value: "Personal" }]);
    for (const record of titles.records) {
      assert.equal(
        record.some((field) => field.label === "Vehicle use"),
        false,
      );
    }
  });

  it("keeps the odometer unit code off the records entirely", () => {
    for (const record of titles.records) {
      assert.equal(
        record.some((field) => /unit/i.test(field.label)),
        false,
      );
    }
    assert.equal(
      titles.shared?.some((field) => /unit/i.test(field.label)),
      false,
    );
  });

  it("leaves the year, make and model to the heading that already states them", () => {
    assert.deepEqual(report.specifications, []);
  });

  it("keeps the VIN out of the specification grid", () => {
    const withVin = normalizeVinAuditReport(
      { ...PAYLOAD, attributes: { ...PAYLOAD.attributes, VIN: VIN, Engine: "2.5L L4" } },
      VIN,
    );
    assert.deepEqual(withVin.specifications, [{ label: "Engine", value: "2.5L L4" }]);
  });

  it("still exposes the provider link on the model for support", () => {
    assert.equal(report.providerReportUrl, PAYLOAD.reportlink);
  });

  it("lists odometer readings in sortable order with a real unit, echo dropped", () => {
    assert.deepEqual(
      report.odometer.map((reading) => [reading.date, reading.value, reading.unit]),
      [
        ["2015-06-19", 41_204, "mi"],
        ["2019-03-08", 78_930, "mi"],
        ["2024-09-27", 121_477, "mi"],
      ],
    );
  });

  it("reads a wide sales feed as cards, not as a table with a tail", () => {
    const withSales = normalizeVinAuditReport(
      {
        ...PAYLOAD,
        sales: [
          {
            vin: VIN,
            date: "2024-08-14",
            listing_type: "Dealer classified",
            listingprice: "11450",
            meter: "120880",
            meterunit: "M",
            sellertype: "Franchise dealer",
            sellername: "Music City Toyota",
            city: "Nashville",
            state: "TN",
            stock_number: "T24-88213",
            exterior_color: "Super White",
            interior_color: "Ash cloth",
            days_listed: "34",
            description: "One-owner trade-in, service records available.",
          },
        ],
      },
      VIN,
    );

    const sales = find(withSales.sections, "sales");
    assert.equal(sales.layout, "listings");
    // A table here is what made the section unreadable: six columns and then a
    // paragraph of leftovers under every row.
    assert.equal(sectionTable(sales), null);

    const [card] = sectionListings(sales);
    assert.equal(card.headline, "Dealer classified");
    assert.equal(card.date, "Aug 14, 2024");
    // The feed sends `11450`. It leads the card now, so it cannot read as one.
    assert.equal(card.price, "$11,450");
    assert.deepEqual(card.summary, [
      { label: "Mileage", value: "120,880 mi" },
      { label: "Location", value: "Nashville, TN" },
      { label: "Seller", value: "Music City Toyota" },
    ]);
    assert.deepEqual(
      card.detail.map((field) => field.label),
      [
        "Seller type",
        "Stock number",
        "Exterior color",
        "Interior color",
        "Days listed",
        "Description",
      ],
    );
    // The VIN and the unit code are stripped before any of this runs.
    assert.equal(
      [...card.summary, ...card.detail].some(
        (field) => field.label === "VIN" || /unit/i.test(field.label),
      ),
      false,
    );
  });

  it("maps seller_name and listing_price onto the card face", () => {
    const report = normalizeVinAuditReport(
      {
        ...PAYLOAD,
        sales: [
          {
            date: "2024-08-14",
            listing_price: "11450",
            seller_name: "Blaise Alexander Subaru",
            city: "Muncy",
            state: "PA",
          },
        ],
      },
      VIN,
    );
    const [card] = sectionListings(find(report.sections, "sales"));
    assert.equal(card.price, "$11,450");
    assert.deepEqual(
      card.summary.find((field) => field.label === "Seller"),
      { label: "Seller", value: "Blaise Alexander Subaru" },
    );
  });

  it("leaves a price the feed already formatted exactly as it arrived", () => {
    const report = normalizeVinAuditReport(
      {
        ...PAYLOAD,
        sales: [
          { date: "2024-08-14", saleprice: "$11,450" },
          { date: "2019-02-22", saleprice: "9995 USD" },
          { date: "2018-01-02", saleprice: "0" },
        ],
      },
      VIN,
    );
    const cards = sectionListings(find(report.sections, "sales"));
    assert.deepEqual(
      cards.map((card) => card.price),
      ["$11,450", "9995 USD", ""],
    );
  });

  it("gives every section a short name for the report outline", () => {
    for (const section of report.sections) {
      assert.ok(section.navLabel, `expected a nav label on "${section.key}"`);
      assert.ok(
        section.navLabel.length <= 16,
        `"${section.navLabel}" is too long for the outline`,
      );
    }
  });

  it("reads a title type as the event that happened", () => {
    const titled = normalizeVinAuditReport(
      {
        titles: [
          { vin: VIN, date: "2024-09-27", state: "TN", titletype: "Title transfer" },
        ],
      },
      VIN,
    );
    const [record] = find(titled.sections, "titles").records;
    assert.deepEqual(record.find((field) => field.label === "Event"), {
      label: "Event",
      value: "Title transfer",
    });
  });

  it("describes empty sections in our own voice", () => {
    const thefts = find(report.sections, "thefts");
    assert.equal(thefts.records.length, 0);
    assert.doesNotMatch(thefts.description, /provider/i);
    assert.doesNotMatch(thefts.emptyLabel, /provider/i);
  });
});
