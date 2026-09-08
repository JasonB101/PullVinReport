import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";

import { fulfillOrder } from "@/lib/fulfillment";
import { getStore } from "@/lib/store";
import type { Order } from "@/lib/store";

const VIN = "4T1BF1FK8CU512345";

const PROVIDER_PAYLOAD = {
  attributes: { Year: "2012", Make: "Toyota", Model: "Camry" },
  titles: [
    { vin: VIN, date: "2024-09-27", state: "TN", meter: "121477", meterunit: "M", current: true },
    { vin: VIN, date: "2019-03-08", state: "KY", meter: "78930", meterunit: "M", current: false },
  ],
};

const BRIEF_BULLET = "Two title records across two states, no brands reported.";

const BRIEF_REPLY = JSON.stringify({
  fromReport: [BRIEF_BULLET],
  commonForModel: ["Water pumps fail early on this generation."],
  questions: ["Are the service records available?"],
});

/** Every outbound call fulfillment makes, in the order it made them. */
let calls: string[] = [];
/** Set per test to fail the model call without touching the other two. */
let briefStatus = 200;

const realFetch = globalThis.fetch;
const saved = new Map<string, string | undefined>();
let dataDir = "";

function setEnv(key: string, value: string): void {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  process.env[key] = value;
}

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "pvr-fulfillment-"));
  setEnv("DATA_DIR", dataDir);
  setEnv("VINAUDIT_API_KEY", "test-provider-key");
  setEnv("VINAUDIT_USER", "test-user");
  setEnv("VINAUDIT_PASS", "test-pass");
  setEnv("ANTHROPIC_API_KEY", "test-model-key");
  setEnv("RESEND_API_KEY", "test-mail-key");

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url.includes("/v2/pullreport")) {
      calls.push("provider");
      return new Response(JSON.stringify(PROVIDER_PAYLOAD), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/v1/messages")) {
      calls.push("brief");
      if (briefStatus !== 200) return new Response("nope", { status: briefStatus });
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: BRIEF_REPLY }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("resend.com")) {
      calls.push("email");
      return new Response(JSON.stringify({ id: "email_test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected request to ${url}`);
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  calls = [];
  briefStatus = 200;
});

async function paidOrder(): Promise<Order> {
  const store = getStore();
  await store.init();
  const order = await store.create({
    vin: VIN,
    email: "buyer@example.com",
    amountCents: 1499,
    currency: "usd",
  });
  return store.update(order.id, { status: "paid" });
}

describe("fulfilling a paid order", () => {
  it("writes the brief before the receipt leaves, so the PDF says what the page says", async () => {
    const order = await paidOrder();
    const result = await fulfillOrder(order.id);

    assert.deepEqual(
      calls,
      ["provider", "brief", "email"],
      "the receipt must be built from an order that already carries its brief",
    );
    assert.deepEqual(result.order.aiBrief?.fromReport, [BRIEF_BULLET]);
    assert.equal(result.order.status, "fulfilled");

    const stored = await getStore().getById(order.id);
    assert.deepEqual(stored?.aiBrief?.fromReport, [BRIEF_BULLET]);
    assert.ok(stored?.aiBriefGeneratedAt);
    assert.ok(stored?.emailSentAt);
  });

  it("delivers on time when the brief does not come back", async () => {
    briefStatus = 500;
    const order = await paidOrder();
    const result = await fulfillOrder(order.id);

    assert.deepEqual(calls, ["provider", "brief", "email"]);
    assert.equal(result.order.status, "fulfilled");
    assert.equal(result.order.aiBrief, null);
    assert.ok(result.order.report, "the records are what was paid for");
  });

  it("does not pull, write or send twice for an order already delivered", async () => {
    const order = await paidOrder();
    await fulfillOrder(order.id);
    calls = [];

    const again = await fulfillOrder(order.id);
    assert.equal(again.alreadyFulfilled, true);
    assert.deepEqual(calls, []);
  });
});
