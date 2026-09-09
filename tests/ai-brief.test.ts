import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  briefFacts,
  exactYearMakeModel,
  factsIndicateResolvedSalvageSale,
  factsIndicateSalvageChannel,
  filterSellerQuestions,
  generateBrief,
  parseBrief,
} from "@/lib/ai-brief";
import { buildSampleBrief, buildSampleReport } from "@/lib/sample-report";
import { normalizeVinAuditReport } from "@/lib/vinaudit";

const VIN = "4T1BF1FK8CU512345";

function paidReport() {
  return normalizeVinAuditReport(
    {
      attributes: { Year: "2012", Make: "Toyota", Model: "Camry", Engine: "2.5L L4" },
      reportlink: "https://provider.example/report/abc123",
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
          state: "KY",
          meter: "78930",
          meterunit: "M",
          current: false,
        },
      ],
    },
    VIN,
  );
}

describe("what the brief is allowed to see", () => {
  const facts = briefFacts(paidReport());
  const serialized = JSON.stringify(facts);

  it("sends the vehicle and the records, and nothing that identifies anyone", () => {
    assert.equal(facts.vehicle, "2012 Toyota Camry");
    assert.equal(facts.yearMakeModel, "2012 Toyota Camry");
    assert.doesNotMatch(serialized, new RegExp(VIN, "i"));
    assert.doesNotMatch(serialized, /provider\.example/);
    assert.doesNotMatch(serialized, /accessToken|access_token|@/i);
  });

  it("says which way the mileage runs rather than leaving it to be inferred", () => {
    assert.equal(facts.odometerDirection, "consistent");
    assert.deepEqual(facts.odometer, [
      "2019-03-08: 78,930 mi (KY)",
      "2024-09-27: 121,477 mi (TN)",
    ]);
  });

  it("states an empty check as nothing on file, not as an absence of data", () => {
    const accidents = facts.checks.find((check) => check.check === "Accident records");
    assert.deepEqual(accidents, { check: "Accident records", result: "nothing on file" });
  });

  it("leaves out categories that came back with nothing", () => {
    assert.deepEqual(
      facts.records.map((entry) => entry.section),
      ["Title, registration & mileage"],
    );
    assert.equal(facts.sales, null);
  });

  it("sends grouped sales listings, not a card dump, when the feed has them", () => {
    const withSales = briefFacts(buildSampleReport());
    assert.ok(withSales.sales);
    assert.equal(withSales.sales.groups.length, 2);
    assert.equal(withSales.sales.groups[0].listingCount, 3);
    assert.equal(withSales.sales.groups[0].price, "$11,450");
    assert.match(withSales.sales.groups[0].headline, /Music City/);
    const serialized = JSON.stringify(withSales.sales);
    assert.match(withSales.sales.notes.join(" "), /listing rows show the \$11,450/);
    assert.doesNotMatch(
      serialized,
      /later listing total|failed to sell|same car advertised|listing campaign/i,
    );
    assert.equal(
      withSales.records.some((entry) => /sales/i.test(entry.section)),
      false,
    );
  });

  it("sends sold and TBD as labels on the listings, not as a story", () => {
    const facts = briefFacts(
      normalizeVinAuditReport(
        {
          attributes: { Year: "2012", Make: "Toyota", Model: "Camry" },
          titles: [{ date: "2024-09-27", state: "TN", meter: "121477", meterunit: "M" }],
          sales: [
            {
              date: "2026-05-11",
              listing_type: "Auction",
              source: "Copart",
              saleprice: "0",
              city: "Nashville",
              state: "TN",
              status: "SOLD",
            },
            {
              date: "2026-05-29",
              listing_type: "Auction",
              source: "Copart",
              saleprice: "TBD",
              city: "Nashville",
              state: "TN",
              status: "TO BE DETERMINED",
            },
            {
              date: "2024-08-14",
              listing_type: "Dealer classified",
              listingprice: "11450",
              sellertype: "Franchise dealer",
              city: "Nashville",
              state: "TN",
            },
          ],
        },
        VIN,
      ),
    );

    assert.ok(facts.sales);
    const told = facts.sales.groups.flatMap((group) => group.listings).join(" ");
    assert.match(told, /Copart/i);
    assert.match(told, /Sold/i);
    assert.match(told, /To be determined/i);
    assert.doesNotMatch(JSON.stringify(facts.sales), /same run|failed to sell|campaign/i);
  });

  it("does not seed a same-day Copart TBD once Sold resolved that run", () => {
    const facts = briefFacts(
      normalizeVinAuditReport(
        {
          attributes: { Year: "2021", Make: "Subaru", Model: "Legacy" },
          jsi: [
            {
              date: "2026-05-11",
              obtainedfrom: "Copart",
              disposition: "TO BE DETERMINED",
            },
            {
              date: "2026-05-11",
              obtainedfrom: "Copart",
              disposition: "SOLD",
            },
          ],
          sales: [
            {
              date: "2026-05-11",
              listing_type: "Auction",
              source: "Copart",
              status: "SOLD",
            },
            {
              date: "2026-05-11",
              listing_type: "Auction",
              source: "Copart",
              status: "TO BE DETERMINED",
            },
          ],
        },
        VIN,
      ),
    );

    const salvage = facts.records.find((entry) => /junk|salvage/i.test(entry.section));
    assert.ok(salvage);
    assert.equal(salvage.rows.length, 1);
    assert.match(salvage.rows[0] ?? "", /Sold/i);
    assert.doesNotMatch(salvage.rows.join(" "), /to be determined|\btbd\b/i);

    assert.ok(facts.sales);
    const listings = facts.sales.groups.flatMap((group) => group.listings).join(" ");
    assert.match(listings, /Sold/i);
    assert.doesNotMatch(listings, /to be determined|\btbd\b/i);
  });

  it("never sends the stored provider payload", () => {
    assert.doesNotMatch(serialized, /reportlink|meterunit/i);
  });
});

describe("reading a brief out of a reply", () => {
  const good = JSON.stringify({
    fromReport: ["Two title records, no brands."],
    commonForModel: ["Some engines in this generation use oil."],
    questions: ["Are service records available?"],
  });

  it("accepts bare JSON and keeps every list", () => {
    const brief = parseBrief(good, "test-model");
    assert.deepEqual(brief, {
      fromReport: ["Two title records, no brands."],
      commonForModel: ["Some engines in this generation use oil."],
      questions: ["Are service records available?"],
      model: "test-model",
    });
  });

  it("accepts JSON that arrives wrapped in a fence or a sentence", () => {
    const brief = parseBrief(
      "Here you go:\n```json\n" + good + "\n```\nHope that helps.",
      "test-model",
    );
    assert.equal(brief?.fromReport.length, 1);
  });

  it("drops a model-level bullet that claims something about this car", () => {
    const brief = parseBrief(
      JSON.stringify({
        fromReport: ["Two title records, no brands."],
        commonForModel: [
          "This vehicle has the oil consumption problem.",
          "Water pumps fail early on this generation.",
        ],
      }),
      "test-model",
    );
    assert.deepEqual(brief?.commonForModel, [
      "Water pumps fail early on this generation.",
    ]);
  });

  it("drops a bullet that puts a price or a grade on the car", () => {
    const brief = parseBrief(
      JSON.stringify({
        fromReport: [
          "Clean title history.",
          "Worth about $9,000 in this condition.",
          "Condition score of 82 out of 100.",
          "Comparable trucks sell for 11,500 dollars.",
          "Auction grade B on the last run.",
        ],
      }),
      "test-model",
    );
    assert.deepEqual(brief?.fromReport, ["Clean title history."]);
  });

  it("lets fromReport cite a listing total that came from the records", () => {
    const brief = parseBrief(
      JSON.stringify({
        fromReport: [
          "Three August 2024 dealer listings in Nashville show an asking total of $11,450.",
        ],
      }),
      "test-model",
    );
    assert.equal(brief?.fromReport.length, 1);
    assert.match(brief?.fromReport[0] ?? "", /\$11,450/);
  });

  it("drops a listing bullet that invents a campaign or a failed sale", () => {
    const brief = parseBrief(
      JSON.stringify({
        fromReport: [
          "Five title records, no brands.",
          "The listing history shows several dealer postings at the same price, which usually means the same car advertised more than once rather than separate sales.",
          "The asking price also dropped over time, typical of a car that didn't sell right away.",
          "The same car listed twice and wouldn't sell at the first ask.",
          "Three August 2024 dealer listings show an asking total of $11,450.",
        ],
      }),
      "test-model",
    );
    assert.deepEqual(brief?.fromReport, [
      "Five title records, no brands.",
      "Three August 2024 dealer listings show an asking total of $11,450.",
    ]);
  });

  it("drops a clean-accident bullet when junk, salvage or Copart is already on file", () => {
    const report = normalizeVinAuditReport(
      {
        attributes: { Year: "2021", Make: "Subaru", Model: "Outback" },
        jsi: [
          {
            date: "2023-04-12",
            disposition: "Sold",
            obtainedfrom: "Copart",
          },
          {
            date: "2023-04-18",
            disposition: "TBD",
            obtainedfrom: "Copart",
          },
        ],
      },
      VIN,
    );
    const facts = briefFacts(report);
    assert.equal(factsIndicateSalvageChannel(facts), true);

    const brief = parseBrief(
      JSON.stringify({
        fromReport: [
          "Copart junk-and-salvage rows from April 2023 show Sold and TBD, which usually follows a total loss and a rebuilt path.",
          "No accident, theft, lien — that's a clean picture on all of those fronts.",
        ],
      }),
      "test-model",
      report.vehicle,
      facts,
    );
    assert.deepEqual(brief?.fromReport, [
      "Copart junk-and-salvage rows from April 2023 show Sold and TBD, which usually follows a total loss and a rebuilt path.",
    ]);
  });

  it("keeps a nothing-on-file accident bullet when there is no salvage channel", () => {
    const facts = briefFacts(paidReport());
    assert.ok(
      facts.checks.some((check) => check.check === "Junk & salvage"),
      "a clear junk/salvage check is present so its label cannot count as a finding",
    );
    assert.equal(factsIndicateSalvageChannel(facts), false);
    const brief = parseBrief(
      JSON.stringify({
        fromReport: [
          "No accident, theft or lien records came back — a clean picture on those fronts.",
        ],
      }),
      "test-model",
      paidReport().vehicle,
      facts,
    );
    assert.equal(brief?.fromReport.length, 1);
  });

  it("drops TBD questions once the salvage disposition is Sold", () => {
    const facts = briefFacts(
      normalizeVinAuditReport(
        {
          attributes: { Year: "2021", Make: "Subaru", Model: "Legacy" },
          jsi: [
            {
              date: "2026-05-11",
              obtainedfrom: "Copart",
              disposition: "SOLD",
            },
            {
              date: "2026-05-11",
              obtainedfrom: "Copart",
              disposition: "TO BE DETERMINED",
            },
          ],
        },
        VIN,
      ),
    );
    assert.equal(factsIndicateResolvedSalvageSale(facts), true);

    const brief = parseBrief(
      JSON.stringify({
        fromReport: [
          "A Copart salvage record from May 11, 2026 shows Sold, which usually follows a total loss.",
        ],
        questions: [
          "Has that to be determined status been resolved?",
          "What was the reason for the salvage, and are repair receipts available?",
          "Has the open air bag recall been completed?",
        ],
      }),
      "test-model",
      { year: "2021", make: "Subaru", model: "Legacy" },
      facts,
    );
    assert.deepEqual(brief?.questions, [
      "What was the reason for the salvage, and are repair receipts available?",
      "Has the open air bag recall been completed?",
    ]);
  });

  it("keeps a TBD question when TBD is still the only salvage disposition", () => {
    const facts = briefFacts(
      normalizeVinAuditReport(
        {
          attributes: { Year: "2021", Make: "Subaru", Model: "Legacy" },
          jsi: [
            {
              date: "2026-05-11",
              obtainedfrom: "Copart",
              disposition: "TBD",
            },
          ],
        },
        VIN,
      ),
    );
    assert.equal(factsIndicateResolvedSalvageSale(facts), false);
    assert.deepEqual(
      filterSellerQuestions(
        ["Has the to be determined disposition been resolved?"],
        facts,
      ),
      ["Has the to be determined disposition been resolved?"],
    );
  });

  it("keeps one salvage/title-brand paperwork question, not a stacked pair", () => {
    assert.deepEqual(
      filterSellerQuestions([
        "What caused the salvage entry, and can you show the repair paperwork?",
        "Can you show the branded-title documentation and receipts?",
        "Was the 2018 rear-end damage repaired, and are the receipts available?",
      ]),
      [
        "What caused the salvage entry, and can you show the repair paperwork?",
        "Was the 2018 rear-end damage repaired, and are the receipts available?",
      ],
    );
  });

  it("keeps a bullet that says what a record costs without naming a number", () => {
    // The point of the brief is the clause after the record. An earlier guard
    // matched the word "worth" and threw exactly this bullet away.
    const kept = [
      "A salvage yard reported taking possession in May 2026, which usually follows a total loss and often ends in a salvage or rebuilt title.",
      "Lenders and insurers treat a branded title differently from a clean one, and it usually costs the owner at resale.",
      "The 2015 lien is not shown as released, which can mean the seller does not yet own the car outright.",
    ];
    const brief = parseBrief(JSON.stringify({ fromReport: kept }), "test-model");
    assert.deepEqual(brief?.fromReport, kept);
  });

  it("has room for a bullet that explains itself", () => {
    const explained =
      "There are junk and salvage records dated May 11, 2026 showing the vehicle passed through a salvage operator, which usually means an insurer declared it a total loss and sent it to auction rather than paying to repair it.";
    assert.ok(explained.length > 200);
    const brief = parseBrief(
      JSON.stringify({ fromReport: [explained] }),
      "test-model",
    );
    assert.deepEqual(brief?.fromReport, [explained]);
  });

  it("refuses a reply with nothing about this report in it", () => {
    assert.equal(parseBrief(JSON.stringify({ commonForModel: ["x"] }), "m"), null);
    assert.equal(parseBrief("I cannot help with that.", "m"), null);
    assert.equal(parseBrief("{ not json", "m"), null);
  });

  it("shortens a bullet that ran on, instead of dropping the brief", () => {
    const long =
      "There are junk and salvage records dated May 11, 2026 showing the vehicle passed through a salvage operator, which usually means an insurer declared it a total loss and sent it to auction rather than paying to repair it. " +
      "x".repeat(400);
    assert.ok(long.length > 520);
    const brief = parseBrief(
      JSON.stringify({
        fromReport: [long, "Mileage rises steadily and no rollback is shown."],
      }),
      "test-model",
    );
    assert.ok(brief);
    assert.equal(brief.fromReport.length, 2);
    assert.ok(brief.fromReport[0].endsWith("…"));
    assert.equal(brief.fromReport[0].length, 520);
    assert.equal(
      brief.fromReport[1],
      "Mileage rises steadily and no rollback is shown.",
    );
  });
});

describe("generating a brief", () => {
  const realFetch = globalThis.fetch;
  const realKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = realKey;
  });

  it("does nothing at all without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch;

    assert.equal(await generateBrief(paidReport()), null);
    assert.equal(called, false);
  });

  it("sends the rules and the facts, and keeps the key in the header", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    let request: { url: string; init: RequestInit } | null = null;

    globalThis.fetch = (async (url: string, init: RequestInit) => {
      request = { url: String(url), init };
      return new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                fromReport: ["Two title records, no brands reported."],
                commonForModel: [],
                questions: [],
              }),
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const brief = await generateBrief(paidReport());
    assert.deepEqual(brief?.fromReport, ["Two title records, no brands reported."]);

    assert.ok(request);
    const sent = request as { url: string; init: RequestInit };
    assert.match(sent.url, /\/v1\/messages$/);
    assert.equal(
      (sent.init.headers as Record<string, string>)["x-api-key"],
      "test-key",
    );

    const body = JSON.parse(String(sent.init.body));
    assert.match(body.system, /Never state an event, brand, mileage/);
    assert.match(body.system, /never say or imply that a problem common/i);
    assert.match(body.system, /Never estimate a price, market value/);
    assert.doesNotMatch(String(sent.init.body), new RegExp(VIN, "i"));
    assert.doesNotMatch(String(sent.init.body), /test-key/);
  });

  it("asks for what a record means, not just what it says", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    let system = "";

    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      system = JSON.parse(String(init.body)).system;
      return new Response(
        JSON.stringify({
          content: [
            { type: "text", text: JSON.stringify({ fromReport: ["Two titles."] }) },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await generateBrief(paidReport());

    // A disposition code and an auction house's name mean nothing to a buyer.
    assert.match(system, /Never leave a trade term standing on its own/);
    assert.match(system, /why that matters to someone about to hand over money/);
    assert.match(system, /salvage or rebuilt title/);
    // ...but a consequence is still what usually happens, not what happened here.
    assert.match(system, /never as what has happened to this car/);
    // The model-level list stays pinned to the vehicle we actually decoded.
    assert.match(system, /FACTS\.yearMakeModel/);
    assert.match(system, /Every bullet MUST name that full year, make and model/);
    assert.match(system, /Never name a sibling/);
    assert.match(system, /FACTS\.sales/);
    assert.match(system, /observable listing facts/);
    assert.match(system, /listing chapters/);
    assert.match(system, /often repeat or vary asking totals without that meaning/);
    assert.match(system, /FORBIDDEN unless FACTS explicitly records sold vs unsold/);
    assert.match(system, /never say there were no accidents/);
    assert.match(system, /Copart, IAA/);
    assert.doesNotMatch(
      system,
      /usually one car advertised|did not find a buyer at the first price|shopping path/,
    );
    assert.match(system, /stated as facts only/);
    assert.match(system, /two sentences and 400 characters/);
    assert.match(system, /do not ask for that paperwork twice/i);
    assert.match(system, /Do not ask whether a TBD/);
  });

  it("sends no temperature, which current models reject outright", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    let body: Record<string, unknown> = {};

    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({ fromReport: ["Two title records."] }),
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await generateBrief(paidReport());
    assert.equal(
      "temperature" in body,
      false,
      "Sonnet 5 rejects the whole request with a 400 when temperature is set",
    );
    assert.equal(body.max_tokens, 2048);
  });

  it("logs what the model said when it says no, not just the status", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const rejection =
      '{"type":"error","error":{"type":"invalid_request_error","message":"temperature is deprecated for this model"}}';
    globalThis.fetch = (async () =>
      new Response(rejection, { status: 400 })) as typeof fetch;

    const logged: string[] = [];
    const realError = console.error;
    console.error = (message: unknown) => logged.push(String(message));

    try {
      assert.equal(await generateBrief(paidReport()), null);
    } finally {
      console.error = realError;
    }

    // A 400 for an unsupported parameter and a 400 for a bad prompt look the
    // same until the body is in the log.
    assert.match(logged.join("\n"), /HTTP 400/);
    assert.match(logged.join("\n"), /temperature is deprecated for this model/);
  });

  it("gives up quietly when the model errors", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    globalThis.fetch = (async () =>
      new Response("nope", { status: 500 })) as typeof fetch;
    assert.equal(await generateBrief(paidReport()), null);
  });

  it("gives up quietly when the reply is not a brief", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ content: [{ type: "text", text: "I can't do that." }] }),
      )) as typeof fetch;
    assert.equal(await generateBrief(paidReport()), null);
  });

  it("logs a snippet of the reply when it cannot parse one", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const cutOff = '{"fromReport":["There are junk and salvage records dated May 11';
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ content: [{ type: "text", text: cutOff }] }),
      )) as typeof fetch;

    const logged: string[] = [];
    const realError = console.error;
    console.error = (message: unknown) => logged.push(String(message));
    try {
      assert.equal(await generateBrief(paidReport()), null);
    } finally {
      console.error = realError;
    }

    assert.match(logged.join("\n"), /could not read a brief/);
    assert.match(logged.join("\n"), /junk and salvage records dated May 11/);
  });
});

describe("pinning model-level notes to this year, make and model", () => {
  const outback = { year: "2021", make: "Subaru", model: "Outback" };

  it("names the exact vehicle, not a sibling", () => {
    assert.equal(exactYearMakeModel(outback), "2021 Subaru Outback");
  });

  it("drops a bullet that names a sibling the way Sonnet named Legacy for an Outback", () => {
    const brief = parseBrief(
      JSON.stringify({
        fromReport: ["Clean title history."],
        commonForModel: [
          "The 2021 Legacy is known for CVT shudder.",
          "2021 Subaru Outback CVTs can shudder at low speed.",
        ],
      }),
      "test-model",
      outback,
    );
    assert.deepEqual(brief?.commonForModel, [
      "2021 Subaru Outback CVTs can shudder at low speed.",
    ]);
  });

  it("drops a bullet that names a different model year", () => {
    const brief = parseBrief(
      JSON.stringify({
        fromReport: ["Clean title history."],
        commonForModel: ["The 2019 Subaru Outback had early EyeSight issues."],
      }),
      "test-model",
      outback,
    );
    assert.deepEqual(brief?.commonForModel, []);
  });

  it("rewrites a nameless bullet so it leads with the exact year, make and model", () => {
    const brief = parseBrief(
      JSON.stringify({
        fromReport: ["Clean title history."],
        commonForModel: ["CVT shudder is commonly reported at low speed."],
      }),
      "test-model",
      outback,
    );
    assert.deepEqual(brief?.commonForModel, [
      "On the 2021 Subaru Outback: CVT shudder is commonly reported at low speed.",
    ]);
  });

  it("writes nothing about the model when we cannot name one", () => {
    const brief = parseBrief(
      JSON.stringify({
        fromReport: ["Clean title history."],
        commonForModel: ["Some engines in this generation use oil."],
      }),
      "test-model",
      { year: "2012" },
    );
    assert.deepEqual(brief?.commonForModel, []);
  });
});

describe("the sample's brief", () => {
  it("is written by hand, so browsing the sample spends nothing", () => {
    const brief = buildSampleBrief();
    assert.equal(brief.model, "sample");
    assert.ok(brief.fromReport.length >= 2);
  });

  it("only claims things the sample records actually show", () => {
    const report = buildSampleReport();
    const titles = report.sections.find((section) => section.key === "titles");
    assert.equal(titles?.records.length, 5);

    const brief = buildSampleBrief();
    assert.match(brief.fromReport.join(" "), /Five title records/);
    assert.match(brief.fromReport.join(" "), /\$11,450/);
    assert.doesNotMatch(brief.fromReport.join(" "), /listing campaign|advertised more than once/i);
    // The model-level notes must not read as findings about the sample car.
    for (const bullet of brief.commonForModel) {
      assert.doesNotMatch(bullet, /\bthis (vehicle|car|vin)\b/i);
    }
  });

  it("survives the same guards a generated brief goes through", () => {
    const brief = buildSampleBrief();
    const reparsed = parseBrief(
      JSON.stringify(brief),
      "sample",
      buildSampleReport().vehicle,
    );
    assert.deepEqual(reparsed?.fromReport, brief.fromReport);
    assert.deepEqual(reparsed?.commonForModel, brief.commonForModel);
    assert.deepEqual(reparsed?.questions, brief.questions);
  });
});
