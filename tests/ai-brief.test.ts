import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { briefFacts, generateBrief, parseBrief } from "@/lib/ai-brief";
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
      ["Title & registration history"],
    );
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
        ],
      }),
      "test-model",
    );
    assert.deepEqual(brief?.fromReport, ["Clean title history."]);
  });

  it("refuses a reply with nothing about this report in it", () => {
    assert.equal(parseBrief(JSON.stringify({ commonForModel: ["x"] }), "m"), null);
    assert.equal(parseBrief("I cannot help with that.", "m"), null);
    assert.equal(parseBrief("{ not json", "m"), null);
  });

  it("keeps the bullets short enough to read", () => {
    const brief = parseBrief(
      JSON.stringify({
        fromReport: ["Clean title history.", "x".repeat(400)],
      }),
      "test-model",
    );
    assert.deepEqual(brief?.fromReport, ["Clean title history."]);
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
    // The model-level notes must not read as findings about the sample car.
    for (const bullet of brief.commonForModel) {
      assert.doesNotMatch(bullet, /\bthis (vehicle|car|vin)\b/i);
    }
  });

  it("survives the same guards a generated brief goes through", () => {
    const brief = buildSampleBrief();
    const reparsed = parseBrief(JSON.stringify(brief), "sample");
    assert.deepEqual(reparsed?.fromReport, brief.fromReport);
    assert.deepEqual(reparsed?.commonForModel, brief.commonForModel);
    assert.deepEqual(reparsed?.questions, brief.questions);
  });
});
