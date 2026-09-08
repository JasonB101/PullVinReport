import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { heroForOrder } from "@/lib/order-hero";
import { buildSampleReport } from "@/lib/sample-report";
import { FileOrderStore } from "@/lib/store/file-store";
import type { Order } from "@/lib/store";
import { heroFacts } from "@/lib/vehicle-hero";

let dataDir = "";
let calls = 0;
const realFetch = globalThis.fetch;
const realKey = process.env.FAL_KEY;
const realDataDir = process.env.DATA_DIR;
const realDb = process.env.DATABASE_URL;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "pvr-hero-"));
  process.env.DATA_DIR = dataDir;
  process.env.FAL_KEY = "test-fal-key";
  delete process.env.DATABASE_URL;
  delete globalThis.__pullvinreportStore;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        images: [{ url: "data:image/jpeg;base64,ZmFrZQ==", content_type: "image/jpeg" }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  delete globalThis.__pullvinreportStore;
  if (realKey === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = realKey;
  if (realDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = realDataDir;
  if (realDb === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = realDb;
  await rm(dataDir, { recursive: true, force: true });
});

async function fulfilledOrder(): Promise<Order> {
  const store = new FileOrderStore(dataDir);
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

describe("the hero on an order", () => {
  it("draws one, caches it by year/make/model/trim/color, and does not draw it again", async () => {
    const order = await fulfilledOrder();
    const before = calls;

    const first = await heroForOrder(order);
    assert.equal(first.status, "ready");
    assert.equal(first.status === "ready" && first.cached, false);
    assert.equal(calls, before + 1);

    const facts = heroFacts(buildSampleReport());
    assert.ok(facts);
    const store = new FileOrderStore(dataDir);
    const cached = await store.getVehicleHero(facts.cacheKey);
    assert.ok(cached);
    assert.match(cached.src, /^data:image\/jpeg;base64,/);

    const second = await heroForOrder(order);
    assert.equal(second.status, "ready");
    assert.equal(second.status === "ready" && second.cached, true);
    assert.equal(calls, before + 1);
  });

  it("does nothing without a key when the cache is empty", async () => {
    delete process.env.FAL_KEY;
    try {
      const store = new FileOrderStore(dataDir);
      const order = await store.create({
        vin: "4T1BF1FK8CU512345",
        email: "empty@example.com",
        amountCents: 1499,
        currency: "usd",
      });
      await store.update(order.id, {
        status: "fulfilled",
        report: {
          ...buildSampleReport(),
          vehicle: { year: "1999", make: "Honda", model: "Civic" },
        },
      });
      const outcome = await heroForOrder(await store.getById(order.id) as Order);
      assert.equal(outcome.status, "unavailable");
      if (outcome.status === "unavailable") {
        assert.match(outcome.reason, /FAL_KEY/);
      }
    } finally {
      process.env.FAL_KEY = "test-fal-key";
    }
  });
});
