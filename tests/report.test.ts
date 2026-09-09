import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReportSection, VehicleReport } from "../src/lib/report.ts";
import {
  currentEvent,
  headerSpecSummary,
  dedupeConsecutiveRecords,
  dedupeOdometerReadings,
  formatEventDate,
  formatGeneratedAt,
  foundIssueChecks,
  groupListings,
  hasOdometerRollback,
  isoDate,
  liftSharedFields,
  preferResolvedDisposition,
  recordCalendarDay,
  reportChips,
  reportNavItems,
  searchedAndEmpty,
  sectionClosedTitle,
  sectionCountLabel,
  sectionLead,
  sectionListingGroups,
  sectionListings,
  sectionTable,
  sectionsWithRecords,
  stackedRecordRow,
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
        columns: ["Date", "State", "Mileage", "Current"],
        records: [
          [
            { label: "Date", value: "Sep 27, 2024" },
            { label: "State", value: "TN" },
            { label: "Mileage", value: "121,477 mi" },
            { label: "Current", value: "Yes" },
            { label: "Vehicle use", value: "Personal" },
          ],
        ],
      }),
    );

    assert.ok(table);
    // "Current" is filled in, so it stays; every column here has a value.
    assert.deepEqual(table.columns, ["Date", "State", "Mileage", "Current"]);
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

  it("marks a mileage that did not move from the older row, so it is not listed twice", () => {
    const table = sectionTable(
      section({
        columns: ["Date", "State", "Mileage"],
        records: [
          [
            { label: "Date", value: "Apr 2, 2020" },
            { label: "State", value: "TN" },
            { label: "Mileage", value: "78,930 mi" },
          ],
          [
            { label: "Date", value: "Mar 8, 2019" },
            { label: "State", value: "TN" },
            { label: "Mileage", value: "78,930 mi" },
          ],
          [
            { label: "Date", value: "Jun 19, 2015" },
            { label: "State", value: "KY" },
            { label: "Mileage", value: "41,204 mi" },
          ],
        ],
      }),
    );

    assert.ok(table);
    assert.deepEqual(
      table.rows.map((row) => row.mileageUnchanged),
      [true, false, false],
    );
  });

  it("drops a column no record filled in rather than printing dashes", () => {
    const table = sectionTable(
      section({
        columns: ["Date", "State", "Mileage", "Current"],
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
          { label: "Mileage", value: "121,477 mi" },
        ],
        [
          { label: "Date", value: "Sep 27, 2024" },
          { label: "Mileage", value: "121,480 mi" },
        ],
      ]).length,
      2,
    );
  });
});

describe("same-day pending vs resolved salvage dispositions", () => {
  const copart = (
    date: string,
    disposition: string,
    house = "Copart",
  ): { label: string; value: string }[] => [
    { label: "Date", value: date },
    { label: "Obtained from", value: house },
    { label: "Disposition", value: disposition },
  ];

  it("reads May 11, 2026 and 2026-05-11 as the same calendar day", () => {
    assert.equal(
      recordCalendarDay([{ label: "Date", value: "May 11, 2026" }]),
      "2026-05-11",
    );
    assert.equal(
      recordCalendarDay([{ label: "Date", value: "2026-05-11" }]),
      "2026-05-11",
    );
  });

  it("keeps Sold and drops TBD when they are the same Copart day", () => {
    const kept = preferResolvedDisposition([
      copart("May 11, 2026", "To be determined"),
      copart("May 11, 2026", "Sold"),
    ]);
    assert.equal(kept.length, 1);
    assert.deepEqual(
      kept[0].find((field) => field.label === "Disposition"),
      { label: "Disposition", value: "Sold" },
    );
  });

  it("keeps a TBD when it is the only disposition that day", () => {
    const only = [copart("May 11, 2026", "TBD")];
    assert.deepEqual(preferResolvedDisposition(only), only);
  });

  it("keeps TBD and Sold when they fall on different days", () => {
    const kept = preferResolvedDisposition([
      copart("May 11, 2026", "Sold"),
      copart("May 29, 2026", "TBD"),
    ]);
    assert.equal(kept.length, 2);
    assert.deepEqual(
      kept.map((record) => record.find((field) => field.label === "Disposition")?.value),
      ["Sold", "TBD"],
    );
  });

  it("does not fold a Copart TBD into an IAA Sold on the same day", () => {
    const kept = preferResolvedDisposition([
      copart("May 11, 2026", "TBD", "Copart"),
      copart("May 11, 2026", "Sold", "IAA"),
    ]);
    assert.equal(kept.length, 2);
  });

  it("does not invent a sale by dropping a lone dealer TBD listing", () => {
    const dealer = [
      [
        { label: "Date", value: "Aug 14, 2024" },
        { label: "Source", value: "Cars.com" },
        { label: "Status", value: "To be determined" },
      ],
    ];
    assert.deepEqual(
      preferResolvedDisposition(dealer, { requireAuctionChannel: true }),
      dealer,
    );
  });

  it("folds same-day Copart listing twins so sales grouping shows one Sold", () => {
    const sales = section({
      key: "sales",
      layout: "listings",
      records: [
        [
          { label: "Date", value: "May 11, 2026" },
          { label: "Listing type", value: "Auction" },
          { label: "Source", value: "Copart" },
          { label: "Status", value: "To be determined" },
        ],
        [
          { label: "Date", value: "May 11, 2026" },
          { label: "Listing type", value: "Auction" },
          { label: "Source", value: "Copart" },
          { label: "Status", value: "Sold" },
        ],
      ],
    });
    const groups = sectionListingGroups(sales);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].listings.length, 1);
    assert.equal(
      groups[0].listings[0].detail.find((field) => field.label === "Status")?.value,
      "Sold",
    );
  });
});

describe("fields that never vary", () => {
  const record = (date: string, state: string) => [
    { label: "Date", value: date },
    { label: "State", value: state },
    { label: "Vehicle use", value: "Personal" },
  ];

  it("states a constant once for the section instead of on every record", () => {
    const { records, shared } = liftSharedFields([
      record("Sep 27, 2024", "TN"),
      record("Mar 8, 2019", "TN"),
    ]);

    assert.deepEqual(shared, [
      { label: "State", value: "TN" },
      { label: "Vehicle use", value: "Personal" },
    ]);
    assert.deepEqual(records, [
      [{ label: "Date", value: "Sep 27, 2024" }],
      [{ label: "Date", value: "Mar 8, 2019" }],
    ]);
  });

  it("leaves a field that varies on the records", () => {
    const { records, shared } = liftSharedFields([
      record("Sep 27, 2024", "TN"),
      record("Mar 8, 2019", "KY"),
    ]);

    assert.deepEqual(shared, [{ label: "Vehicle use", value: "Personal" }]);
    assert.deepEqual(records[0], [
      { label: "Date", value: "Sep 27, 2024" },
      { label: "State", value: "TN" },
    ]);
  });

  it("never empties a record out, even when the records are all alike", () => {
    const alike = [{ label: "State", value: "TN" }];
    const { records, shared } = liftSharedFields([alike, [...alike]]);
    assert.deepEqual(shared, []);
    assert.equal(records.length, 2);
  });

  it("leaves a lone record alone: nothing is repeated yet", () => {
    const only = [record("Sep 27, 2024", "TN")];
    assert.deepEqual(liftSharedFields(only), { records: only, shared: [] });
  });

  it("drops a section out of table layout when too little is left to tabulate", () => {
    // Every column but Date turned out to be constant, so cards read better.
    const { records, shared } = liftSharedFields([
      record("Sep 27, 2024", "TN"),
      record("Mar 8, 2019", "TN"),
    ]);
    assert.equal(shared.length, 2);
    assert.equal(
      sectionTable(section({ columns: ["Date", "State"], records })),
      null,
    );
  });
});

describe("listings", () => {
  /** A listing with the long tail a real sales feed actually sends. */
  const listing = section({
    key: "sales",
    layout: "listings",
    records: [
      [
        { label: "Date", value: "Aug 14, 2024" },
        { label: "Listing type", value: "Dealer classified" },
        { label: "Price", value: "$11,450" },
        { label: "Mileage", value: "120,880 mi" },
        { label: "Seller type", value: "Franchise dealer" },
        { label: "City", value: "Nashville" },
        { label: "State", value: "TN" },
        { label: "Stock number", value: "T24-88213" },
        { label: "Exterior colour", value: "Super White" },
        { label: "Description", value: "One-owner trade-in." },
      ],
    ],
  });

  it("leads with what kind of listing it was, in the feed's own words", () => {
    const [card] = sectionListings(listing);
    assert.equal(card.headline, "Dealer classified");
    assert.equal(card.date, "Aug 14, 2024");
    assert.equal(card.price, "$11,450");
  });

  it("puts only the facts being compared on the front of the card", () => {
    const [card] = sectionListings(listing);
    assert.deepEqual(card.summary, [
      { label: "Mileage", value: "120,880 mi" },
      { label: "Location", value: "Nashville, TN" },
      { label: "Seller type", value: "Franchise dealer" },
    ]);
  });

  it("keeps the long tail rather than dropping it", () => {
    const [card] = sectionListings(listing);
    assert.deepEqual(card.detail, [
      { label: "Stock number", value: "T24-88213" },
      { label: "Exterior colour", value: "Super White" },
      { label: "Description", value: "One-owner trade-in." },
    ]);
  });

  it("never shows the same fact twice", () => {
    const [card] = sectionListings(listing);
    const shown = [
      card.headline,
      card.date,
      card.price,
      ...card.summary.map((field) => field.value),
      ...card.detail.map((field) => field.value),
    ].filter((value) => value.length > 0);
    assert.equal(new Set(shown).size, shown.length);
    // City and state are one fact written twice as far apart as it needs to be.
    assert.equal(
      shown.some((value) => value === "Nashville" || value === "TN"),
      false,
    );
  });

  it("says Listing, not a guess, when the feed did not say what kind it was", () => {
    const [card] = sectionListings(
      section({
        key: "sales",
        layout: "listings",
        records: [[{ label: "Date", value: "Aug 14, 2024" }]],
      }),
    );
    assert.equal(card.headline, "Listing");
    assert.equal(card.price, "");
    assert.deepEqual(card.summary, []);
    assert.deepEqual(card.detail, []);
  });

  it("surfaces a stored Seller name and Listing price as Seller and Price", () => {
    const [card] = sectionListings(
      section({
        key: "sales",
        layout: "listings",
        records: [
          [
            { label: "Date", value: "Aug 14, 2024" },
            { label: "Listing type", value: "Dealer classified" },
            { label: "Listing price", value: "$11,450" },
            { label: "Seller name", value: "Blaise Alexander Subaru" },
            { label: "Seller type", value: "Franchise dealer" },
            { label: "City", value: "Muncy" },
            { label: "State", value: "PA" },
          ],
        ],
      }),
    );
    assert.equal(card.price, "$11,450");
    assert.deepEqual(card.summary, [
      { label: "Location", value: "Muncy, PA" },
      { label: "Seller", value: "Blaise Alexander Subaru" },
      { label: "Seller type", value: "Franchise dealer" },
    ]);
  });

  it("falls back to the seller type when there is no listing type", () => {
    const [card] = sectionListings(
      section({
        key: "sales",
        layout: "listings",
        records: [
          [
            { label: "Seller type", value: "Private party" },
            { label: "Mileage", value: "78,120 mi" },
          ],
        ],
      }),
    );
    assert.equal(card.headline, "Private party");
    // Promoted to the headline, so it must not also sit in the summary.
    assert.deepEqual(card.summary, [{ label: "Mileage", value: "78,120 mi" }]);
  });

  it("leaves the records themselves untouched, so a re-render is stable", () => {
    const before = JSON.stringify(listing.records);
    sectionListings(listing);
    sectionListings(listing);
    assert.equal(JSON.stringify(listing.records), before);
  });
});

describe("listing groups", () => {
  const dealer = (overrides: Record<string, string> = {}) => {
    const fields = {
      Date: "Aug 14, 2024",
      "Listing type": "Dealer classified",
      Price: "$11,450",
      Mileage: "120,880 mi",
      City: "Nashville",
      State: "TN",
      ...overrides,
    };
    return Object.entries(fields).map(([label, value]) => ({ label, value }));
  };

  it("folds nearby snapshots at one dealer group into one chapter", () => {
    const groups = sectionListingGroups(
      section({
        key: "sales",
        layout: "listings",
        records: [
          dealer({ Seller: "Music City Toyota" }),
          dealer({
            Date: "Aug 16, 2024",
            Price: "$11,295",
            City: "Brentwood",
            Seller: "Music City Honda",
            "Listing type": "Online marketplace",
            Source: "Autotrader",
          }),
          dealer({ Date: "Feb 22, 2019", Price: "$9,995", City: "Bowling Green", State: "KY" }),
        ],
      }),
    );

    assert.equal(groups.length, 2);
    assert.equal(groups[0].listings.length, 2);
    assert.equal(groups[0].price, "$11,295–$11,450");
    assert.match(groups[0].date, /Aug 14–16, 2024|Aug 14, 2024 – Aug 16, 2024/);
    assert.match(groups[0].identity, /Music City/);
    assert.match(groups[0].location, /Nashville|Brentwood|Tennessee/);
    assert.equal(groups[1].listings.length, 1);
    assert.equal(groups[1].price, "$9,995");
  });

  it("does not treat the same dollars years later as the same chapter", () => {
    const groups = groupListings(
      sectionListings(
        section({
          key: "sales",
          layout: "listings",
          records: [
            dealer({ Date: "Aug 14, 2024", Price: "$11,450", Seller: "Music City Toyota" }),
            dealer({ Date: "May 3, 2019", Price: "$11,450", Seller: "Music City Toyota" }),
          ],
        }),
      ),
    );

    assert.equal(groups.length, 2);
    assert.equal(groups[0].listings.length, 1);
    assert.equal(groups[1].listings.length, 1);
  });

  it("keeps unpriced snapshots in the chapter when time and place match", () => {
    const groups = sectionListingGroups(
      section({
        key: "sales",
        layout: "listings",
        records: [
          dealer({ Price: "", Seller: "Music City Toyota" }),
          dealer({ Price: "Call for price", City: "Memphis", Seller: "Music City Toyota" }),
        ],
      }),
    );

    assert.equal(groups.length, 1);
    assert.equal(groups[0].listings.length, 2);
  });

  it("names the chapter for the dealer, not the listing type", () => {
    const [group] = sectionListingGroups(
      section({
        key: "sales",
        layout: "listings",
        records: [
          dealer({ Seller: "Music City Toyota" }),
          dealer({ Date: "Aug 18, 2024", City: "Franklin", Seller: "Music City Honda" }),
        ],
      }),
    );

    assert.match(group.identity, /Music City/);
    assert.equal(group.listings.length, 2);
  });

  it("turns a 40-row sister-rooftop feed into a short chapter timeline", () => {
    const row = (fields: Record<string, string>) =>
      Object.entries({
        "Listing type": "Dealer classified",
        Mileage: "12 mi",
        ...fields,
      }).map(([label, value]) => ({ label, value }));

    const records = [
      row({ Date: "Jan 15, 2021", Price: "$36,300", Seller: "Alexander Subaru", City: "Muncy", State: "PA" }),
      row({ Date: "Jan 16, 2021", Price: "$36,300", Seller: "Blaise Alexander Subaru", City: "Muncy", State: "PA" }),
      row({ Date: "Jan 20, 2021", Price: "$35,990", Seller: "Aubrey Alexander Toyota", City: "Williamsport", State: "PA" }),
      row({ Date: "Feb 3, 2021", Price: "$34,995", Seller: "Blaise Alexander Buick", City: "Muncy", State: "PA" }),
      row({ Date: "Feb 18, 2021", Price: "$33,700", Seller: "Autotrader", City: "Muncy", State: "PA", "Listing type": "Online marketplace", Source: "Autotrader" }),
      row({ Date: "Mar 1, 2021", Price: "$33,700", Seller: "Alexander Subaru", City: "Lewisburg", State: "PA" }),
      row({ Date: "Nov 10, 2022", Price: "$33,995", Seller: "Blaise Alexander Subaru", City: "Muncy", State: "PA", Mileage: "8,410 mi" }),
      row({ Date: "Dec 1, 2022", Price: "$33,800", Seller: "Alexander Subaru", City: "Muncy", State: "PA", Mileage: "8,410 mi" }),
      row({ Date: "Jan 15, 2023", Price: "$34,000", Seller: "Blaise Alexander Subaru", City: "Lewisburg", State: "PA", Mileage: "9,020 mi" }),
      row({ Date: "Feb 20, 2023", Price: "$30,900", Seller: "Bergstrom Subaru", City: "Appleton", State: "WI", Mileage: "11,200 mi" }),
      row({ Date: "Feb 22, 2023", Price: "$30,900", Seller: "Express.Cars", City: "Appleton", State: "WI", Mileage: "11,200 mi", "Listing type": "Online marketplace" }),
      row({ Date: "Mar 10, 2023", Price: "$30,500", Seller: "Bergstrom Subaru of Appleton", City: "Appleton", State: "WI", Mileage: "11,340 mi" }),
      row({ Date: "Mar 28, 2023", Price: "$30,300", Seller: "Express.Cars", City: "Appleton", State: "WI", Mileage: "11,340 mi", Source: "Express.Cars" }),
      row({ Date: "May 12, 2024", Price: "$27,995", Seller: "Gustman Subaru", City: "Appleton", State: "WI", Mileage: "18,640 mi" }),
      row({ Date: "May 13, 2024", Price: "$27,995", Seller: "Cars.com", City: "Appleton", State: "WI", Mileage: "18,640 mi", Source: "Cars.com" }),
    ];

    const groups = sectionListingGroups(
      section({ key: "sales", layout: "listings", records }),
    );

    assert.equal(groups.length, 4);
    assert.match(groups[0].identity, /Gustman/);
    assert.equal(groups[0].price, "$27,995");
    assert.match(groups[1].identity, /Bergstrom/);
    assert.doesNotMatch(groups[1].identity, /Blaise|Alexander|Express/i);
    assert.equal(groups[1].price, "$30,300–$30,900");
    assert.match(groups[2].identity, /Alexander/);
    assert.match(groups[2].identity, /network/);
    assert.match(groups[3].identity, /Alexander/);
    assert.match(groups[3].identity, /network/);
    assert.equal(groups[3].price, "$33,700–$36,300");
    assert.match(groups[3].location, /Pennsylvania|Muncy|Lewisburg|Williamsport/);
    assert.equal(
      groups.reduce((sum, group) => sum + group.listings.length, 0),
      records.length,
    );
    assert.doesNotMatch(
      groups.map((group) => group.identity).join(" "),
      /Blaise Alexander Subaru ·|selling at every/i,
    );
  });
});

describe("odometer readings", () => {
  const reading = (date: string, value: number, source = "WI") => ({
    date,
    value,
    unit: "mi",
    source,
  });

  it("keeps every dated event, even when the mileage repeats", () => {
    const readings = [
      reading("2024-05-22", 34_502),
      reading("2025-01-28", 34_502),
      reading("2026-05-15", 34_502),
      reading("2026-05-29", 66_103),
    ];
    assert.deepEqual(dedupeOdometerReadings(readings), readings);
  });

  it("drops the same reading echoed twice for one event", () => {
    const kept = dedupeOdometerReadings([
      reading("2024-09-27", 121_477),
      reading("2024-09-27", 121_477),
    ]);
    assert.equal(kept.length, 1);
  });

  it("keeps two states reporting the same mileage on the same day", () => {
    const kept = dedupeOdometerReadings([
      reading("2024-09-27", 121_477, "TN"),
      reading("2024-09-27", 121_477, "KY"),
    ]);
    assert.equal(kept.length, 2);
  });

  it("calls a reading lower than the one before it a rollback", () => {
    assert.equal(
      hasOdometerRollback([reading("2019-03-08", 78_930), reading("2024-09-27", 41_204)]),
      true,
    );
    assert.equal(
      hasOdometerRollback([reading("2019-03-08", 41_204), reading("2024-09-27", 78_930)]),
      false,
    );
    assert.equal(
      hasOdometerRollback([reading("2019-03-08", 41_204), reading("2024-09-27", 41_204)]),
      false,
    );
  });
});

describe("the record in force", () => {
  it("states the current record without repeating the flag itself", () => {
    const current = currentEvent(
      section({
        records: [
          [
            { label: "Date", value: "Sep 27, 2024" },
            { label: "State", value: "TN" },
            { label: "Current", value: "Yes" },
          ],
          [
            { label: "Date", value: "Mar 8, 2019" },
            { label: "State", value: "TN" },
            { label: "Current", value: "No" },
          ],
        ],
      }),
    );

    assert.equal(current?.label, "Current title");
    assert.deepEqual(current?.fields, [
      { label: "Date", value: "Sep 27, 2024" },
      { label: "State", value: "TN" },
    ]);
  });

  it("says nothing when no record is flagged as current", () => {
    assert.equal(
      currentEvent(section({ records: [[{ label: "State", value: "TN" }]] })),
      null,
    );
  });

  it("does not put a title number or a claim code back on the line above the table", () => {
    const current = currentEvent(
      section({
        columns: ["Date", "State", "Mileage", "Event", "Current"],
        records: [
          [
            { label: "Date", value: "May 11, 2026" },
            { label: "State", value: "TX" },
            { label: "Mileage", value: "146,820 mi" },
            { label: "Event", value: "Salvage" },
            { label: "Current", value: "Yes" },
            { label: "Title number", value: "12345678901234567" },
            { label: "Standard claim", value: "Salvage" },
          ],
        ],
      }),
    );

    assert.deepEqual(
      current?.fields.map((field) => field.label),
      ["Date", "State", "Mileage", "Event"],
    );
    assert.equal(
      current?.fields.some((field) => field.value === "12345678901234567"),
      false,
    );
  });
});

describe("the specs on the vehicle card", () => {
  it("picks engine and body before a long tail of build-record leftovers", () => {
    assert.deepEqual(
      headerSpecSummary([
        { label: "Anti-brake system", value: "4-Wheel ABS" },
        { label: "Engine", value: "2.5L L4" },
        { label: "Style", value: "4 Door Sedan" },
        { label: "Standard seating", value: "5" },
        { label: "Fuel type", value: "Gasoline" },
      ]),
      [
        { label: "Style", value: "4 Door Sedan" },
        { label: "Engine", value: "2.5L L4" },
        { label: "Fuel type", value: "Gasoline" },
      ],
    );
  });

  it("does not print the engine twice when the style already spells it out", () => {
    assert.deepEqual(
      headerSpecSummary([
        { label: "Style", value: "Limited Sedan AWD CVT 2.4L H4" },
        { label: "Engine", value: "2.4L H4" },
        { label: "Fuel type", value: "Gasoline" },
      ]),
      [
        { label: "Style", value: "Limited Sedan AWD CVT 2.4L H4" },
        { label: "Fuel type", value: "Gasoline" },
      ],
    );
  });
});

function report(overrides: Partial<VehicleReport> = {}): VehicleReport {
  return {
    vin: "4T1BF1FK8CU512345",
    source: "sample",
    isSample: true,
    generatedAt: "2026-01-14T15:04:00.000Z",
    vehicle: { year: "2012", make: "Toyota", model: "Camry" },
    headline: "",
    specifications: [],
    odometer: [{ date: "2024-09-27", value: 121_477, unit: "mi", source: "TN" }],
    checks: [
      { key: "titles", label: "Title records", status: "found", count: 4, detail: "" },
      { key: "branded", label: "Branded title", status: "clear", count: 0, detail: "" },
      {
        key: "accidents",
        label: "Accident records",
        status: "found",
        count: 2,
        detail: "",
      },
    ],
    sections: [
      section({
        key: "titles",
        navLabel: "Titles",
        records: [[{ label: "State", value: "TN" }]],
      }),
      section({ key: "thefts", navLabel: "Thefts", records: [] }),
    ],
    ...overrides,
  };
}

describe("the header of a report", () => {
  it("states the title brand, the mileage direction and the flags that fired", () => {
    assert.deepEqual(reportChips(report()), [
      { key: "branded", label: "Clean title", tone: "clear" },
      { key: "odometer", label: "Odometer consistent", tone: "clear" },
      { key: "accidents", label: "2 accidents", tone: "flag" },
      { key: "titles", label: "4 title records", tone: "neutral" },
    ]);
  });

  it("flags a brand and a rollback when the records show them", () => {
    const chips = reportChips(
      report({
        checks: [
          { key: "titles", label: "Title records", status: "found", count: 2, detail: "" },
          {
            key: "branded",
            label: "Branded title",
            status: "found",
            count: 1,
            detail: "",
          },
        ],
        odometer: [
          { date: "2019-03-08", value: 78_930, unit: "mi", source: "TN" },
          { date: "2024-09-27", value: 41_204, unit: "mi", source: "TN" },
        ],
      }),
    );

    assert.deepEqual(chips.slice(0, 2), [
      { key: "branded", label: "Branded title", tone: "flag" },
      { key: "odometer", label: "Odometer rollback", tone: "flag" },
    ]);
  });

  it("never invents a grade, a score or a value", () => {
    for (const chip of reportChips(report())) {
      assert.doesNotMatch(chip.label, /grade|score|\$|value|excellent|poor/i);
    }
  });

  it("puts nothing in the outline that has nothing to show", () => {
    assert.deepEqual(reportNavItems(report()), [
      { href: "#brief", label: "What to know" },
      { href: "#titles", label: "Titles" },
    ]);
  });

  it("lists an empty category by name instead of giving it a section", () => {
    assert.deepEqual(searchedAndEmpty(report()), ["Thefts"]);
    assert.deepEqual(
      sectionsWithRecords(report()).map((entry) => entry.key),
      ["titles"],
    );
  });

  it("does not put specifications in the outline — they live on the vehicle card", () => {
    const items = reportNavItems(
      report({
        specifications: [
          { label: "Engine", value: "2.5L L4" },
          { label: "Fuel type", value: "Gasoline" },
        ],
      }),
    );
    assert.equal(
      items.some((item) => /spec/i.test(item.label) || item.href === "#specifications"),
      false,
    );
  });

  it("does not give mileage its own outline entry — it lives on the title rows", () => {
    const items = reportNavItems(report());
    assert.equal(
      items.some((item) => item.href === "#odometer" || /odometer/i.test(item.label)),
      false,
    );
  });

  it("prints the generated time in Mountain Time, not UTC", () => {
    assert.equal(formatGeneratedAt("2026-01-14T15:04:00.000Z"), "Jan 14, 2026, 8:04 AM MST");
    assert.match(formatGeneratedAt("2026-07-14T15:04:00.000Z"), /MDT$/);
    assert.doesNotMatch(formatGeneratedAt("2026-01-14T15:04:00.000Z"), /UTC/);
  });

  it("treats title counts as routine, not a finding in What to know", () => {
    assert.deepEqual(
      foundIssueChecks(report()).map((check) => check.key),
      ["accidents"],
    );
  });

  it("surfaces junk/salvage from the section even when no jsi check was stored", () => {
    const flags = foundIssueChecks(
      report({
        sections: [
          section({
            key: "titles",
            navLabel: "Titles",
            records: [[{ label: "State", value: "TN" }]],
          }),
          section({
            key: "jsi",
            navLabel: "Junk & salvage",
            records: [
              [
                { label: "Date", value: "May 11, 2026" },
                { label: "Obtained from", value: "Copart" },
              ],
            ],
          }),
        ],
      }),
    );
    assert.deepEqual(
      flags.map((check) => [check.key, check.count]),
      [
        ["jsi", 1],
        ["accidents", 2],
      ],
    );
  });

  it("keeps branded-title and junk/salvage counts as separate findings", () => {
    const flags = foundIssueChecks(
      report({
        checks: [
          { key: "titles", label: "Title records", status: "found", count: 9, detail: "" },
          { key: "branded", label: "Branded title", status: "found", count: 1, detail: "" },
          { key: "jsi", label: "Junk & salvage", status: "found", count: 2, detail: "" },
        ],
        sections: [
          section({
            key: "titles",
            records: [[{ label: "Event", value: "Salvage" }]],
          }),
          section({
            key: "jsi",
            navLabel: "Junk & salvage",
            records: [
              [{ label: "Date", value: "May 11, 2026" }],
              [{ label: "Date", value: "May 11, 2026" }],
            ],
          }),
        ],
      }),
    );
    const branded = flags.find((check) => check.key === "branded");
    const jsi = flags.find((check) => check.key === "jsi");
    assert.equal(branded?.count, 1);
    assert.equal(jsi?.count, 2);
  });

  it("puts junk/salvage on its own chip, not under branded title", () => {
    const chips = reportChips(
      report({
        checks: [
          { key: "titles", label: "Title records", status: "found", count: 9, detail: "" },
          { key: "branded", label: "Branded title", status: "found", count: 1, detail: "" },
          { key: "jsi", label: "Junk & salvage", status: "found", count: 2, detail: "" },
        ],
      }),
    );
    assert.ok(chips.some((chip) => chip.key === "branded" && chip.label === "Branded title"));
    assert.ok(
      chips.some((chip) => chip.key === "jsi" && chip.label === "2 junk/salvage records"),
    );
  });
});

describe("section summary cards", () => {
  it("leads a title section with the current title, not the whole table", () => {
    const titles = section({
      key: "titles",
      columns: ["Date", "State", "Mileage", "Event", "Current"],
      records: [
        [
          { label: "Date", value: "Sep 27, 2024" },
          { label: "State", value: "TN" },
          { label: "Mileage", value: "121,477 mi" },
          { label: "Event", value: "Title transfer" },
          { label: "Current", value: "Yes" },
        ],
      ],
    });

    assert.equal(sectionCountLabel(titles), "1 record");
    assert.equal(sectionClosedTitle(titles), "Title & registration history");
    assert.deepEqual(sectionLead(titles), {
      label: "Current title",
      text: "Sep 27, 2024 · TN · 121,477 mi · Title transfer",
    });
  });

  it("uses the short nav label on a closed card when one exists", () => {
    assert.equal(
      sectionClosedTitle(
        section({
          key: "jsi",
          title: "Junk, salvage & insurance records",
          navLabel: "Junk & salvage",
        }),
      ),
      "Junk & salvage",
    );
  });

  it("stacks a title row so Event, Current and brand stay on a phone card", () => {
    const titles = section({
      key: "titles",
      columns: ["Date", "State", "Mileage", "Event", "Brand", "Current"],
      records: [
        [
          { label: "Date", value: "May 29, 2026" },
          { label: "State", value: "CO" },
          { label: "Mileage", value: "84,310 mi" },
          { label: "Event", value: "Salvage title issued" },
          { label: "Brand", value: "Salvage" },
          { label: "Current", value: "Yes" },
          { label: "Title number", value: "1234567" },
        ],
        [
          { label: "Date", value: "May 11, 2026" },
          { label: "State", value: "CO" },
          { label: "Mileage", value: "84,310 mi" },
          { label: "Event", value: "Salvage" },
          { label: "Brand", value: "Salvage" },
          { label: "Current", value: "No" },
        ],
      ],
    });
    const table = sectionTable(titles);
    assert.ok(table);
    const stacked = stackedRecordRow(table, table.rows[0]);
    assert.equal(stacked.headline, "Salvage title issued");
    assert.equal(stacked.date, "May 29, 2026");
    assert.equal(stacked.meta, "CO · 84,310 mi unchanged");
    assert.equal(stacked.brand, "Salvage");
    assert.equal(stacked.current, "Yes");
    assert.equal(
      stacked.extras.some((field) => field.label === "Title number"),
      true,
    );
  });

  it("counts sales as chapters and snapshots", () => {
    const sales = section({
      key: "sales",
      layout: "listings",
      records: [
        [
          { label: "Date", value: "Aug 14, 2024" },
          { label: "Seller", value: "Music City Toyota" },
          { label: "City", value: "Nashville" },
          { label: "State", value: "TN" },
          { label: "Price", value: "$11,450" },
        ],
        [
          { label: "Date", value: "Feb 22, 2019" },
          { label: "Seller", value: "Bowling Green Motors" },
          { label: "City", value: "Bowling Green" },
          { label: "State", value: "KY" },
          { label: "Price", value: "$9,995" },
        ],
      ],
    });

    assert.match(sectionCountLabel(sales), /chapter/);
    assert.equal(sectionLead(sales)?.label, "Latest chapter");
  });
});
