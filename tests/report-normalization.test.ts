import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sectionListings, sectionTable, titleHistoryStatus } from "@/lib/report";
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

/** 2018 VW Beetle order f485be84 — CA salvage check + IAA Sold/TBD, titles unbranded. */
const BEETLE_VIN = "3VW5DAAT4JM515636";
const BEETLE_PAYLOAD = {
  clean: false,
  attributes: {
    Year: "2018",
    Make: "Volkswagen",
    Model: "Beetle",
    Trim: "SE",
  },
  titles: [
    { vin: BEETLE_VIN, date: "2026-07-07", meter: "76251", state: "CA", current: true, meter_unit: "M" },
    { vin: BEETLE_VIN, date: "2023-07-24", meter: "66980", state: "CA", current: false, meter_unit: "M" },
    { vin: BEETLE_VIN, date: "2022-12-15", meter: "34854", state: "CA", current: false, meter_unit: "M" },
    { vin: BEETLE_VIN, date: "2021-09-01", meter: "34854", state: "CA", current: false, meter_unit: "M" },
    { vin: BEETLE_VIN, date: "2018-08-06", meter: "7", state: "CA", current: false, meter_unit: "M" },
  ],
  jsi: [
    {
      date: "2026-06-03",
      record_type: "Junk And Salvage",
      brander_city: "WESTCHESTER",
      brander_code: "P000116",
      brander_name: "IAA",
      brander_state: "IL",
      intended_for_export: "Y",
      vehicle_disposition: "SOLD",
    },
    {
      date: "2026-06-03",
      record_type: "Junk And Salvage",
      brander_city: "WESTCHESTER",
      brander_code: "P000116",
      brander_name: "IAA",
      brander_state: "IL",
      intended_for_export: "N",
      vehicle_disposition: "TO BE DETERMINED",
    },
  ],
  salvage: [{ vin: BEETLE_VIN, date: "2026-07-09", type: "salvage" }],
  checks: [
    {
      date: "2026-07-07",
      brand_code: "11",
      brand_title: "Salvage: Damage or Not Specified",
      brander_code: "CA",
      brander_name: "CALIFORNIA",
      brander_type: "State",
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

  it("drops a same-day Copart TBD once Sold is on the junk/salvage record", () => {
    const withJsi = normalizeVinAuditReport(
      {
        ...PAYLOAD,
        jsi: [
          {
            date: "2026-05-11",
            obtainedfrom: "Copart",
            disposition: "TO BE DETERMINED",
            city: "Denver",
            state: "CO",
          },
          {
            date: "2026-05-11",
            obtainedfrom: "Copart",
            disposition: "SOLD",
            city: "Denver",
            state: "CO",
          },
        ],
      },
      VIN,
    );
    const jsi = find(withJsi.sections, "jsi");
    assert.equal(jsi.records.length, 1);
    assert.equal(
      jsi.records[0].find((field) => field.label === "Disposition")?.value,
      "Sold",
    );
    assert.equal(
      jsi.records.some((record) =>
        record.some((field) => /to be determined|^tbd$/i.test(field.value)),
      ),
      false,
    );
  });

  it("keeps a junk/salvage TBD when no Sold resolves it", () => {
    const withJsi = normalizeVinAuditReport(
      {
        ...PAYLOAD,
        jsi: [
          {
            date: "2026-05-11",
            obtainedfrom: "Copart",
            disposition: "TBD",
          },
        ],
      },
      VIN,
    );
    assert.equal(find(withJsi.sections, "jsi").records.length, 1);
    assert.equal(
      find(withJsi.sections, "jsi").records[0].find(
        (field) => field.label === "Disposition",
      )?.value,
      "TBD",
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

  it("emits junk/salvage as its own check and does not fold that count into branded", () => {
    const withBoth = normalizeVinAuditReport(
      {
        ...PAYLOAD,
        titles: [
          ...PAYLOAD.titles,
          {
            vin: VIN,
            date: "2026-05-11",
            state: "CO",
            meter: "84200",
            meterunit: "M",
            brand: "Salvage",
            title: "Salvage",
          },
        ],
        jsi: [
          {
            date: "2026-05-11",
            obtainedfrom: "Copart",
            disposition: "SOLD",
            city: "Denver",
            state: "CO",
          },
          {
            date: "2026-05-11",
            obtainedfrom: "Copart",
            disposition: "TO BE DETERMINED",
            city: "Denver",
            state: "CO",
          },
        ],
      },
      VIN,
    );
    const branded = withBoth.checks.find((entry) => entry.key === "branded");
    const jsi = withBoth.checks.find((entry) => entry.key === "jsi");
    assert.ok(branded);
    assert.ok(jsi);
    assert.equal(branded.status, "found");
    assert.equal(branded.count, 1);
    assert.equal(jsi.status, "found");
    assert.equal(jsi.count, 1);
    assert.match(withBoth.headline, /Branded-title/);
  });

  it("headlines salvage-channel activity when titles are unbranded", () => {
    const salvageOnly = normalizeVinAuditReport(
      {
        ...PAYLOAD,
        jsi: [
          {
            date: "2026-05-11",
            obtainedfrom: "Copart",
            disposition: "Salvage",
          },
        ],
      },
      VIN,
    );
    const branded = salvageOnly.checks.find((entry) => entry.key === "branded");
    const jsi = salvageOnly.checks.find((entry) => entry.key === "jsi");
    assert.equal(branded?.status, "clear");
    assert.equal(branded?.count, 0);
    assert.equal(jsi?.status, "found");
    assert.equal(jsi?.count, 1);
    assert.match(salvageOnly.headline, /Junk, salvage or insurance-loss/);
    assert.doesNotMatch(salvageOnly.headline, /Branded-title/);
    assert.doesNotMatch(salvageOnly.headline, /clean/i);
  });

  it("does not treat a bare Copart Sold row as salvage-history", () => {
    const auctionOnly = normalizeVinAuditReport(
      {
        ...PAYLOAD,
        jsi: [
          {
            date: "2026-05-11",
            obtainedfrom: "Copart",
            disposition: "SOLD",
          },
        ],
      },
      VIN,
    );
    assert.match(auctionOnly.headline, /on the title records we have/);
    assert.doesNotMatch(auctionOnly.headline, /Junk, salvage or insurance-loss/);
  });

  it("treats Copart clear-title JSI plus ordinary titles as a clean title", () => {
    const copartClean = normalizeVinAuditReport(
      {
        ...PAYLOAD,
        jsi: [
          {
            date: "2026-05-11",
            obtainedfrom: "Copart",
            disposition: "CT",
            sale_document: "Clean Title Front Line",
          },
        ],
      },
      VIN,
    );
    const branded = copartClean.checks.find((entry) => entry.key === "branded");
    const jsi = copartClean.checks.find((entry) => entry.key === "jsi");
    assert.equal(branded?.status, "clear");
    assert.equal(jsi?.status, "found");
    assert.match(copartClean.headline, /on the title records we have/);
    assert.doesNotMatch(copartClean.headline, /Junk, salvage or insurance-loss/);
  });

  it("does not treat an empty titles feed as a clean title", () => {
    const thin = normalizeVinAuditReport(
      { attributes: { Year: "2016", Make: "Mini", Model: "Clubman" }, clean: true },
      VIN,
    );
    const branded = thin.checks.find((entry) => entry.key === "branded");
    assert.equal(branded?.status, "unavailable");
    assert.match(thin.headline, /cannot say whether the title is clean/i);
    assert.doesNotMatch(thin.headline, /no salvage, junk or insurance-loss brand was reported/i);
  });

  it("treats VinAudit brand-check rows as branded, not clean", () => {
    const withChecks = normalizeVinAuditReport(
      {
        ...PAYLOAD,
        checks: [
          {
            date: "2015-02-10",
            brand_code: "11",
            brander_type: "State",
            brander_name: "NEW YORK",
          },
        ],
      },
      VIN,
    );
    const branded = withChecks.checks.find((entry) => entry.key === "branded");
    assert.equal(branded?.status, "found");
    assert.match(withChecks.headline, /Branded-title/);
  });

  it("does not treat VinAudit clean:false as a brand when titles are unbranded", () => {
    const flagged = normalizeVinAuditReport(
      { ...PAYLOAD, clean: false },
      VIN,
    );
    const branded = flagged.checks.find((entry) => entry.key === "branded");
    assert.equal(branded?.status, "clear");
    assert.match(flagged.headline, /on the title records we have/);
  });

  it("keeps Clean on a bare IAA Sold row when clean:false is only the JSI flag", () => {
    const iaa = normalizeVinAuditReport(
      {
        ...PAYLOAD,
        clean: false,
        jsi: [
          {
            date: "2026-06-03",
            brander_name: "IAA",
            vehicle_disposition: "SOLD",
            intended_for_export: "Y",
          },
        ],
      },
      VIN,
    );
    assert.equal(iaa.checks.find((entry) => entry.key === "branded")?.status, "clear");
    assert.equal(iaa.checks.find((entry) => entry.key === "jsi")?.status, "found");
    assert.match(iaa.headline, /on the title records we have/);
    assert.ok(iaa.sections.find((section) => section.key === "jsi")?.records.length);
  });

  it("does not claim Clean when IAA JSI record_type is Junk And Salvage", () => {
    const iaaJunk = normalizeVinAuditReport(
      {
        ...PAYLOAD,
        clean: false,
        jsi: [
          {
            date: "2026-06-03",
            record_type: "Junk And Salvage",
            brander_name: "IAA",
            vehicle_disposition: "SOLD",
            intended_for_export: "Y",
          },
        ],
      },
      VIN,
    );
    assert.equal(titleHistoryStatus(iaaJunk), "salvage-history");
    assert.match(iaaJunk.headline, /Junk, salvage or insurance-loss/);
    assert.ok(iaaJunk.sections.find((section) => section.key === "jsi")?.records.length);
  });

  it("treats the Beetle IAA + CA salvage-check payload as branded, not Clean", () => {
    const beetle = normalizeVinAuditReport(BEETLE_PAYLOAD, BEETLE_VIN);
    const branded = beetle.checks.find((entry) => entry.key === "branded");
    const jsi = beetle.checks.find((entry) => entry.key === "jsi");
    const jsiSection = find(beetle.sections, "jsi");
    assert.equal(branded?.status, "found");
    assert.equal(titleHistoryStatus(beetle), "branded");
    assert.match(beetle.headline, /Branded-title/);
    assert.doesNotMatch(beetle.headline, /on the title records we have/);
    assert.ok(jsi && jsi.status === "found" && jsi.count >= 1);
    assert.equal(
      jsiSection.records.some((record) =>
        record.some((field) => /to be determined|^tbd$/i.test(field.value)),
      ),
      false,
    );
    assert.ok(
      jsiSection.records.some((record) =>
        record.some((field) => /^sold$/i.test(field.value)),
      ),
    );
  });

  it("collapses official vehicle_disposition TBD once Sold is on the same day", () => {
    const official = normalizeVinAuditReport(
      {
        ...PAYLOAD,
        jsi: [
          {
            date: "2026-05-11",
            record_type: "Junk And Salvage",
            brander_name: "Copart",
            vehicle_disposition: "TO BE DETERMINED",
            brander_city: "Denver",
            brander_state: "CO",
          },
          {
            date: "2026-05-11",
            record_type: "Junk And Salvage",
            brander_name: "Copart",
            vehicle_disposition: "SOLD",
            brander_city: "Denver",
            brander_state: "CO",
          },
        ],
      },
      VIN,
    );
    const jsi = find(official.sections, "jsi");
    assert.equal(jsi.records.length, 1);
    assert.equal(
      jsi.records[0].find((field) => field.label === "Disposition")?.value,
      "Sold",
    );
    assert.equal(
      jsi.records.some((record) =>
        record.some((field) => /to be determined|^tbd$/i.test(field.value)),
      ),
      false,
    );
  });

  it("describes empty sections in our own voice", () => {
    const thefts = find(report.sections, "thefts");
    assert.equal(thefts.records.length, 0);
    assert.doesNotMatch(thefts.description, /provider/i);
    assert.doesNotMatch(thefts.emptyLabel, /provider/i);
  });
});
