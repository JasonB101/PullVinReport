import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import type { VehicleBrief } from "@/lib/ai-brief";
import { briefForOrder } from "@/lib/order-brief";
import { buildSampleReport } from "@/lib/sample-report";
import { getStore } from "@/lib/store";
import type { Order } from "@/lib/store";

const REPLY = JSON.stringify({
  fromReport: ["Five title records across two states, no brands reported."],
  commonForModel: ["Water pumps fail early on this generation."],
  questions: ["Are the service records available?"],
});

let dataDir = "";
let calls = 0;
const realFetch = globalThis.fetch;
const realKey = process.env.ANTHROPIC_API_KEY;
const realDataDir = process.env.DATA_DIR;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "pvr-brief-"));
  process.env.DATA_DIR = dataDir;
  process.env.ANTHROPIC_API_KEY = "test-key";
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: REPLY }] }),
      { status: 200 },
    );
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = realKey;
  if (realDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = realDataDir;
  await rm(dataDir, { recursive: true, force: true });
});

/** A fulfilled order in the file store, as a paid report would leave it. */
async function fulfilledOrder(): Promise<Order> {
  const store = getStore();
  await store.init();
  const order = await store.create({
    vin: "4T1BF1FK8CU512345",
    email: "buyer@example.com",
    amountCents: 1499,
    currency: "usd",
  });
  return store.update(order.id, {
    status: "fulfilled",
    report: buildSampleReport(),
    fulfilledAt: new Date().toISOString(),
  });
}

describe("the brief on an order", () => {
  it("writes one, stores it on the order, and does not write it again", async () => {
    const order = await fulfilledOrder();
    const before = calls;

    const first = await briefForOrder(order);
    assert.equal(first.status, "ready");
    assert.equal(first.status === "ready" && first.cached, false);
    assert.equal(calls, before + 1);

    const stored = await getStore().getById(order.id);
    assert.deepEqual(stored?.aiBrief?.fromReport, [
      "Five title records across two states, no brands reported.",
    ]);
    assert.ok(stored?.aiBriefGeneratedAt);

    const second = await briefForOrder(stored as Order);
    assert.equal(second.status === "ready" && second.cached, true);
    assert.equal(calls, before + 1, "a second read must not call the model");
  });

  it("writes a new one only when a refresh is asked for", async () => {
    const order = await fulfilledOrder();
    await briefForOrder(order);
    const cached = (await getStore().getById(order.id)) as Order;

    const before = calls;
    const refreshed = await briefForOrder(cached, { refresh: true });
    assert.equal(refreshed.status === "ready" && refreshed.cached, false);
    assert.equal(calls, before + 1);
  });

  it("has nothing to say about an order with no report", async () => {
    const store = getStore();
    await store.init();
    const pending = await store.create({
      vin: "4T1BF1FK8CU512345",
      email: "buyer@example.com",
      amountCents: 1499,
      currency: "usd",
    });

    const before = calls;
    const outcome = await briefForOrder(pending);
    assert.equal(outcome.status, "unavailable");
    assert.equal(calls, before);
  });

  it("says why there is no brief when the key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const order = await fulfilledOrder();
      const outcome = await briefForOrder(order);
      assert.equal(outcome.status, "unavailable");
      assert.match(
        outcome.status === "unavailable" ? outcome.reason : "",
        /ANTHROPIC_API_KEY/,
      );
    } finally {
      process.env.ANTHROPIC_API_KEY = "test-key";
    }
  });

  it("keeps the cached brief exactly as it was written", async () => {
    const order = await fulfilledOrder();
    const outcome = await briefForOrder(order);
    const brief: VehicleBrief | null =
      outcome.status === "ready" ? outcome.brief : null;
    const stored = await getStore().getById(order.id);
    assert.deepEqual(stored?.aiBrief, brief);
  });

  it("scrubs leftover markup off a cached brief without calling the model", async () => {
    const order = await fulfilledOrder();
    const stored = await getStore().update(order.id, {
      aiBrief: {
        fromReport: ["Five title records<br>across two states."],
        commonForModel: [],
        questions: ["Any receipts?</br>Ask the seller."],
        model: "cached",
      },
      aiBriefGeneratedAt: new Date().toISOString(),
    });
    const before = calls;
    const outcome = await briefForOrder(stored);
    assert.equal(outcome.status, "ready");
    assert.equal(outcome.status === "ready" && outcome.cached, true);
    assert.equal(calls, before);
    if (outcome.status !== "ready") return;
    assert.equal(outcome.brief.fromReport[0], "Five title records\nacross two states.");
    assert.doesNotMatch(JSON.stringify(outcome.brief), /<\/?br/i);
  });
});
