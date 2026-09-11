import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  composeModelExtras,
  displayComponent,
  engineDisplacementHint,
  extrasForReport,
  hasModelExtras,
  isRetryableHttpStatus,
  matchingEpaOptions,
  MODEL_EXTRAS_FETCH_ATTEMPTS,
  modelExtrasSummaryLine,
  nhtsaModelCandidates,
  parseComplaintsPayload,
  parseEpaOptions,
  parseEpaVehicle,
  parseRecallsPayload,
  pickMpg,
  requestPaidModelExtras,
  resetModelExtrasCacheForTests,
  resetModelExtrasRetryForTests,
  setModelExtrasRetryDelaysForTests,
  ymmCacheKey,
  ymmFromVehicle,
} from "@/lib/model-extras";
import { buildSampleModelExtras, buildSampleReport, SAMPLE_VIN } from "@/lib/sample-report";
import { FileOrderStore } from "@/lib/store/file-store";

const RECALLS = {
  Count: 2,
  results: [
    {
      NHTSACampaignNumber: "13V014000",
      Component: "AIR BAGS:FRONTAL:SENSOR/CONTROL MODULE-INACTIVE",
      Consequence: "Airbags may not deploy.",
      Remedy: "Dealers will recalibrate the sensors.",
    },
    {
      NHTSACampaignNumber: "13V442000",
      Component: "ELECTRICAL SYSTEM",
      Consequence: "A short circuit may disable the air bags.",
      Remedy: "Dealers will seal the condenser housing.",
    },
  ],
};

const COMPLAINTS = {
  count: 10,
  results: [
    {
      odiNumber: 1001,
      components: "POWER TRAIN,ENGINE",
      vin: "4T1BF1FK9CU",
      summary:
        "Severe transmission shudder during normal driving around 30 mph after a fluid service did not help.",
      dateComplaintFiled: "03/04/2020",
      crash: false,
      fire: false,
    },
    {
      odiNumber: 1002,
      components: "POWER TRAIN",
      vin: "4T1BF1FK1CU",
      summary: "Harsh 2-3 shift and delayed engagement from a stop.",
      dateComplaintFiled: "01/15/2019",
    },
    {
      odiNumber: 1003,
      components: "AIR BAGS",
      vin: "JTDBE32K123",
      summary: "Passenger airbag light stays on after a low-speed bump.",
      dateComplaintFiled: "08/20/2021",
    },
    {
      odiNumber: 1004,
      components: "UNKNOWN OR OTHER",
      vin: "IGNOREME",
      summary: "Unspecified noise from under the dash.",
      dateComplaintFiled: "06/01/2018",
    },
    {
      odiNumber: 1005,
      components: "VEHICLE SPEED CONTROL",
      vin: "ABC",
      summary:
        "Car surged forward while braking for a stop sign. Driver avoided a collision.",
      dateComplaintFiled: "11/12/2021",
      crash: true,
    },
  ],
};

const EPA_OPTIONS = {
  menuItem: [
    { text: "Auto (S6), 4 cyl, 2.5 L", value: "31765" },
    { text: "Auto (S6), 6 cyl, 3.5 L", value: "31766" },
  ],
};

const EPA_25 = {
  city08: "24",
  highway08: "34",
  comb08: "28",
  fuelType1: "Regular Gasoline",
  displ: "2.5",
};

const EPA_35 = {
  city08: 21,
  highway08: 30,
  comb08: 24,
  fuelType1: "Regular Gasoline",
  displ: "3.5",
};

describe("model extras parsers", () => {
  it("summarises NHTSA recall campaigns without calling the network", () => {
    const recalls = parseRecallsPayload(RECALLS);
    assert.ok(recalls);
    assert.equal(recalls.total, 2);
    assert.equal(recalls.campaigns[0]?.campaign, "13V014000");
    assert.match(recalls.campaigns[0]?.title ?? "", /Air Bags/i);
    assert.match(recalls.campaigns[0]?.consequence ?? "", /not deploy/);
    assert.match(recalls.campaigns[1]?.title ?? "", /Electrical/i);
  });

  it("counts owner complaints and names top components, never a complaint VIN", () => {
    const complaints = parseComplaintsPayload(COMPLAINTS);
    assert.ok(complaints);
    assert.equal(complaints.total, 10);
    assert.deepEqual(
      complaints.themes.map((theme) => theme.component),
      ["Power Train", "Air Bags", "Engine", "Vehicle Speed Control"],
    );
    assert.equal(
      JSON.stringify(complaints).includes("4T1BF1FK"),
      false,
      "complaint VINs must not leak into the summary",
    );
  });

  it("keeps a short sample of real complaint write-ups, crash first", () => {
    const complaints = parseComplaintsPayload(COMPLAINTS);
    assert.ok(complaints);
    assert.ok(complaints.samples.length >= 3);
    assert.ok(complaints.samples.length <= 5);
    assert.equal(complaints.samples[0]?.crash, true);
    assert.match(complaints.samples[0]?.summary ?? "", /surged forward/);
    assert.equal(complaints.samples[0]?.odiNumber, "1005");
    assert.match(complaints.samples[0]?.components ?? "", /Vehicle Speed Control/);
    assert.equal(complaints.samples[0]?.date, "Nov 12, 2021");
    for (const sample of complaints.samples) {
      assert.ok(sample.summary.length > 20);
      assert.doesNotMatch(sample.summary, /4T1BF1FK|JTDBE32K|IGNOREME/);
    }
  });

  it("clips huge NHTSA summaries so the card stays readable", () => {
    const complaints = parseComplaintsPayload({
      count: 1,
      results: [
        {
          odiNumber: 9,
          components: "ENGINE",
          summary: "x".repeat(800),
          dateComplaintFiled: "01/02/2024",
        },
      ],
    });
    assert.ok(complaints);
    assert.equal(complaints.samples.length, 1);
    assert.ok(complaints.samples[0]!.summary.length <= 480);
    assert.match(complaints.samples[0]!.summary, /…$/);
  });

  it("skips the UNKNOWN OR OTHER complaint bucket", () => {
    const complaints = parseComplaintsPayload(COMPLAINTS);
    assert.ok(complaints);
    assert.equal(
      complaints.themes.some((theme) => /unknown/i.test(theme.component)),
      false,
    );
  });

  it("reads EPA menu options as an array or a single item", () => {
    assert.deepEqual(parseEpaOptions(EPA_OPTIONS), [
      { text: "Auto (S6), 4 cyl, 2.5 L", id: "31765" },
      { text: "Auto (S6), 6 cyl, 3.5 L", id: "31766" },
    ]);
    assert.deepEqual(
      parseEpaOptions({ menuItem: { text: "Manual, 4 cyl, 2.0 L", value: "1" } }),
      [{ text: "Manual, 4 cyl, 2.0 L", id: "1" }],
    );
  });

  it("hides MPG when trims disagree and we cannot match an engine", () => {
    const vehicles = [
      parseEpaVehicle(EPA_25, "31765"),
      parseEpaVehicle(EPA_35, "31766"),
    ].filter((row): row is NonNullable<typeof row> => Boolean(row));
    assert.equal(pickMpg(vehicles, ""), undefined);
    assert.deepEqual(pickMpg(vehicles, "2.5"), {
      city: 24,
      highway: 34,
      combined: 28,
      fuelType: "Regular Gasoline",
    });
  });

  it("uses MPG when every EPA option agrees", () => {
    const one = parseEpaVehicle(EPA_25, "31765");
    assert.ok(one);
    assert.deepEqual(pickMpg([one, { ...one, id: "other" }], ""), {
      city: 24,
      highway: 34,
      combined: 28,
      fuelType: "Regular Gasoline",
    });
  });

  it("matches EPA option text on litres", () => {
    const options = parseEpaOptions(EPA_OPTIONS);
    assert.deepEqual(
      matchingEpaOptions(options, "2.5").map((row) => row.id),
      ["31765"],
    );
  });

  it("reads a 2.5L hint from the report engine line", () => {
    assert.equal(
      engineDisplacementHint({ engine: "2.5L L4 DOHC 16V" }),
      "2.5",
    );
    assert.equal(engineDisplacementHint({}), "");
  });

  it("title-cases NHTSA component paths", () => {
    assert.equal(
      displayComponent("AIR BAGS:FRONTAL"),
      "Air Bags · Frontal",
    );
  });

  it("refuses to compose extras without a year, make and model", () => {
    assert.equal(ymmFromVehicle({ make: "Toyota", model: "Camry" }), null);
    assert.equal(ymmCacheKey("2012", "Toyota", "Camry"), "2012|toyota|camry");
  });

  it("tries NHTSA's shorter model name after a series token, not Grand Cherokee", () => {
    assert.deepEqual(nhtsaModelCandidates("Clubman Cooper"), [
      "Clubman Cooper",
      "Clubman",
    ]);
    assert.deepEqual(nhtsaModelCandidates("Cooper Clubman"), [
      "Cooper Clubman",
      "Clubman",
    ]);
    assert.deepEqual(nhtsaModelCandidates("Camry"), ["Camry"]);
    assert.deepEqual(nhtsaModelCandidates("Grand Cherokee"), ["Grand Cherokee"]);
  });

  it("hides the card when every slice is empty", () => {
    const ymm = ymmFromVehicle({ year: "2012", make: "Toyota", model: "Camry" });
    assert.ok(ymm);
    assert.equal(composeModelExtras(ymm, {}), null);
    assert.equal(hasModelExtras(null), false);
    assert.equal(
      hasModelExtras({
        year: "2012",
        make: "Toyota",
        model: "Camry",
        ymmLabel: "2012 Toyota Camry",
      }),
      false,
    );
  });
});

describe("model extras retry policy", () => {
  it("retries transient HTTP failures three times and not 404s", () => {
    assert.equal(MODEL_EXTRAS_FETCH_ATTEMPTS, 3);
    assert.equal(isRetryableHttpStatus(500), true);
    assert.equal(isRetryableHttpStatus(503), true);
    assert.equal(isRetryableHttpStatus(429), true);
    assert.equal(isRetryableHttpStatus(408), true);
    assert.equal(isRetryableHttpStatus(404), false);
    assert.equal(isRetryableHttpStatus(400), false);
  });
});

describe("model extras copy", () => {
  it("names the model year and says the extras are not this VIN", () => {
    const extras = buildSampleModelExtras();
    assert.equal(extras.ymmLabel, "2012 Toyota Camry");
    const line = modelExtrasSummaryLine(extras);
    assert.match(line, /NHTSA recall campaigns for this model year/);
    assert.match(line, /owner complaints for this model year/);
    assert.match(line, /24 city \/ 34 hwy \/ 28 combined/);
    assert.doesNotMatch(line, new RegExp(SAMPLE_VIN, "i"));
    assert.doesNotMatch(JSON.stringify(extras), /this VIN has|on this VIN/i);
  });

  it("keeps the sample fixture free of complaint VINs", () => {
    const extras = buildSampleModelExtras();
    assert.equal(JSON.stringify(extras).includes(SAMPLE_VIN), false);
    assert.equal(extras.recalls?.total, 2);
    assert.equal(extras.complaints?.total, 644);
    assert.ok((extras.complaints?.samples.length ?? 0) >= 3);
    assert.match(extras.complaints?.samples[0]?.summary ?? "", /transmission shudder/i);
    assert.equal(extras.mpg?.combined, 28);
  });
});

describe("model extras cache key", () => {
  it("versions the cache so a theme-only extras blob cannot stick", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/lib/model-extras.ts", import.meta.url)),
      "utf8",
    );
    assert.match(source, /EXTRAS_CACHE_VERSION = "v3"/);
    assert.match(source, /\$\{EXTRAS_CACHE_VERSION\}\|\$\{ymmCacheKey/);
  });
});

describe("model extras fetch and cache", () => {
  const realFetch = globalThis.fetch;
  let calls = 0;

  before(() => {
    setModelExtrasRetryDelaysForTests([0, 0]);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls += 1;
      const href = String(input);
      if (href.includes("recallsByVehicle")) {
        return new Response(JSON.stringify(RECALLS), { status: 200 });
      }
      if (href.includes("complaintsByVehicle")) {
        return new Response(JSON.stringify(COMPLAINTS), { status: 200 });
      }
      if (href.includes("menu/options")) {
        return new Response(JSON.stringify(EPA_OPTIONS), { status: 200 });
      }
      if (href.endsWith("/31765")) {
        return new Response(JSON.stringify(EPA_25), { status: 200 });
      }
      if (href.endsWith("/31766")) {
        return new Response(JSON.stringify(EPA_35), { status: 200 });
      }
      return new Response("nope", { status: 404 });
    }) as typeof fetch;
  });

  after(() => {
    globalThis.fetch = realFetch;
    resetModelExtrasCacheForTests();
    resetModelExtrasRetryForTests();
  });

  it("fetches once per YMM and reuses that for another order of the same car", async () => {
    resetModelExtrasCacheForTests();
    calls = 0;
    const report = buildSampleReport();
    const first = await extrasForReport(report);
    assert.ok(first);
    assert.equal(first.recalls?.total, 2);
    assert.equal(first.complaints?.total, 10);
    assert.ok((first.complaints?.samples.length ?? 0) >= 3);
    assert.equal(first.complaints?.samples[0]?.crash, true);
    assert.deepEqual(first.mpg, {
      city: 24,
      highway: 34,
      combined: 28,
      fuelType: "Regular Gasoline",
    });
    const afterFirst = calls;
    assert.ok(afterFirst >= 4, `expected NHTSA + EPA calls, got ${afterFirst}`);

    const second = await extrasForReport({
      ...report,
      vin: "4T1BF1FK8CU000001",
    });
    assert.deepEqual(second, first);
    assert.equal(calls, afterFirst);
  });

  it("soft-fails a downed slice and still returns the others", async () => {
    resetModelExtrasCacheForTests();
    calls = 0;
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes("complaintsByVehicle")) {
        throw new Error("timeout");
      }
      return previous(input);
    }) as typeof fetch;
    try {
      const extras = await extrasForReport(buildSampleReport());
      assert.ok(extras);
      assert.ok(extras.recalls);
      assert.equal(extras.complaints, undefined);
      assert.ok(extras.mpg);
    } finally {
      globalThis.fetch = previous;
    }
  });

  it("writes the YMM cache on the store so a new process does not re-hit the APIs", async () => {
    resetModelExtrasCacheForTests();
    calls = 0;
    const dir = await mkdtemp(path.join(tmpdir(), "pvr-extras-"));
    try {
      const store = new FileOrderStore(dir);
      await store.init();
      const first = await extrasForReport(buildSampleReport(), store);
      assert.ok(first);
      const afterFirst = calls;
      resetModelExtrasCacheForTests();
      const second = await extrasForReport(buildSampleReport(), store);
      assert.deepEqual(second, first);
      assert.equal(calls, afterFirst);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns nothing when the report cannot name a year, make and model", async () => {
    resetModelExtrasCacheForTests();
    const before = calls;
    const extras = await extrasForReport({
      ...buildSampleReport(),
      vehicle: { year: "2012" },
    });
    assert.equal(extras, null);
    assert.equal(calls, before);
  });

  it("retries a 5xx then returns the slice that recovered", async () => {
    resetModelExtrasCacheForTests();
    let recallTries = 0;
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes("recallsByVehicle")) {
        recallTries += 1;
        if (recallTries < MODEL_EXTRAS_FETCH_ATTEMPTS) {
          return new Response("down", { status: 503 });
        }
      }
      return previous(input);
    }) as typeof fetch;
    try {
      const extras = await extrasForReport(buildSampleReport());
      assert.ok(extras);
      assert.equal(extras.recalls?.total, 2);
      assert.equal(recallTries, MODEL_EXTRAS_FETCH_ATTEMPTS);
    } finally {
      globalThis.fetch = previous;
    }
  });

  it("retries a timeout then keeps the recovered slice", async () => {
    resetModelExtrasCacheForTests();
    let complaintTries = 0;
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes("complaintsByVehicle")) {
        complaintTries += 1;
        if (complaintTries < 2) throw new Error("timeout");
      }
      return previous(input);
    }) as typeof fetch;
    try {
      const extras = await extrasForReport(buildSampleReport());
      assert.ok(extras);
      assert.ok(extras.complaints);
      assert.equal(complaintTries, 2);
    } finally {
      globalThis.fetch = previous;
    }
  });

  it("does not retry a 404 and omits extras when every slice stays empty", async () => {
    resetModelExtrasCacheForTests();
    const previous = globalThis.fetch;
    const seen: Record<string, number> = {};
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const href = String(input);
      const key = href.includes("recalls")
        ? "recalls"
        : href.includes("complaints")
          ? "complaints"
          : href.includes("menu/options")
            ? "epa"
            : "other";
      seen[key] = (seen[key] ?? 0) + 1;
      return new Response("nope", { status: 404 });
    }) as typeof fetch;
    try {
      const extras = await extrasForReport(buildSampleReport());
      assert.equal(extras, null);
      assert.equal(seen.recalls, 1);
      assert.equal(seen.complaints, 1);
      assert.equal(seen.epa, 1);
    } finally {
      globalThis.fetch = previous;
    }
  });

  it("uses NHTSA Clubman rows when the report model is Clubman Cooper", async () => {
    resetModelExtrasCacheForTests();
    const previous = globalThis.fetch;
    const recallModels: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const href = String(input);
      const model = new URL(href).searchParams.get("model") ?? "";
      if (href.includes("recallsByVehicle")) {
        recallModels.push(model);
        if (/clubman cooper/i.test(model)) {
          return new Response(JSON.stringify({ Count: 0, results: [] }), {
            status: 200,
          });
        }
        if (/^clubman$/i.test(model)) {
          return new Response(
            JSON.stringify({
              Count: 2,
              results: [
                {
                  NHTSACampaignNumber: "16V553000",
                  Component: "AIR BAGS:SIDE/WINDOW",
                  Consequence: "Airbag may not inflate as intended.",
                  Remedy: "Dealers will modify the covers.",
                },
                {
                  NHTSACampaignNumber: "17E051000",
                  Component: "TRAILER HITCHES",
                  Consequence: "The hitch may fail.",
                  Remedy: "Replace the hitch.",
                },
              ],
            }),
            { status: 200 },
          );
        }
      }
      if (href.includes("complaintsByVehicle")) {
        if (/clubman cooper/i.test(model)) {
          return new Response(JSON.stringify({ count: 0, results: [] }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({
            count: 18,
            results: [
              {
                odiNumber: 2001,
                components: "AIR BAGS",
                summary: "Curtain airbag light stays on after a low-speed bump.",
                dateComplaintFiled: "04/02/2017",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (href.includes("menu/options")) {
        return new Response(JSON.stringify({ menuItem: [] }), { status: 200 });
      }
      return new Response("nope", { status: 404 });
    }) as typeof fetch;
    try {
      const extras = await extrasForReport({
        ...buildSampleReport(),
        vehicle: { year: "2016", make: "Mini", model: "Clubman Cooper" },
      });
      assert.ok(extras);
      assert.equal(extras.ymmLabel, "2016 Mini Clubman Cooper");
      assert.deepEqual(
        extras.recalls?.campaigns.map((row) => row.campaign),
        ["16V553000", "17E051000"],
      );
      assert.equal(extras.complaints?.total, 18);
      assert.deepEqual(recallModels, ["Clubman Cooper", "Clubman"]);
    } finally {
      globalThis.fetch = previous;
    }
  });

  it("omits the model zone when every NHTSA name, including fallbacks, is empty", async () => {
    resetModelExtrasCacheForTests();
    const previous = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ Count: 0, count: 0, results: [] }), {
        status: 200,
      })) as typeof fetch;
    try {
      const extras = await extrasForReport({
        ...buildSampleReport(),
        vehicle: { year: "2016", make: "Mini", model: "Clubman Cooper" },
      });
      assert.equal(extras, null);
    } finally {
      globalThis.fetch = previous;
    }
  });

  it("gives up after three 5xx attempts and omits the empty model zone", async () => {
    resetModelExtrasCacheForTests();
    const previous = globalThis.fetch;
    const seen: Record<string, number> = {};
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const href = String(input);
      const key = href.includes("recalls")
        ? "recalls"
        : href.includes("complaints")
          ? "complaints"
          : href.includes("menu/options")
            ? "epa"
            : "other";
      seen[key] = (seen[key] ?? 0) + 1;
      return new Response("down", { status: 503 });
    }) as typeof fetch;
    try {
      const extras = await extrasForReport(buildSampleReport());
      assert.equal(extras, null);
      assert.equal(seen.recalls, MODEL_EXTRAS_FETCH_ATTEMPTS);
      assert.equal(seen.complaints, MODEL_EXTRAS_FETCH_ATTEMPTS);
      assert.equal(seen.epa, MODEL_EXTRAS_FETCH_ATTEMPTS);
    } finally {
      globalThis.fetch = previous;
    }
  });
});

describe("paid extras client request", () => {
  it("retries 5xx then returns extras, and stops on a clean unavailable", async () => {
    setModelExtrasRetryDelaysForTests([0, 0]);
    try {
      let tries = 0;
      const recovered = await requestPaidModelExtras("tok", async () => {
        tries += 1;
        if (tries < 3) return new Response("down", { status: 503 });
        return new Response(
          JSON.stringify({ status: "ready", extras: buildSampleModelExtras() }),
          { status: 200 },
        );
      });
      assert.ok(recovered);
      assert.equal(recovered.recalls?.total, 2);
      assert.equal(tries, 3);

      let unavailableTries = 0;
      const empty = await requestPaidModelExtras("tok", async () => {
        unavailableTries += 1;
        return new Response(JSON.stringify({ status: "unavailable" }), {
          status: 200,
        });
      });
      assert.equal(empty, null);
      assert.equal(unavailableTries, 1);
    } finally {
      resetModelExtrasRetryForTests();
    }
  });
});
