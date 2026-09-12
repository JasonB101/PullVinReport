import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { FileOrderStore } from "@/lib/store/file-store";
import {
  MONEY_ACTIVITY_STATUSES,
  UNPAID_CHECKOUT_STATUSES,
} from "@/lib/store/unpaid-checkouts";

const VIN = "4T1BF1FK8CU512345";

let dataDir = "";

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "pvr-admin-orders-"));
});

after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("admin order lists", () => {
  it("keeps unpaid checkouts out of money-activity stats and list", async () => {
    const store = new FileOrderStore(dataDir);
    await store.init();

    const pending = await store.create({
      vin: VIN,
      email: "pending@example.com",
      amountCents: 1499,
      currency: "usd",
    });
    const expired = await store.create({
      vin: VIN,
      email: "expired@example.com",
      amountCents: 1499,
      currency: "usd",
    });
    await store.update(expired.id, { status: "expired" });

    const paid = await store.create({
      vin: VIN,
      email: "paid@example.com",
      amountCents: 1499,
      currency: "usd",
    });
    await store.update(paid.id, {
      status: "paid",
      stripePaymentIntentId: "pi_paid",
    });

    const fulfilled = await store.create({
      vin: VIN,
      email: "fulfilled@example.com",
      amountCents: 1499,
      currency: "usd",
    });
    await store.update(fulfilled.id, {
      status: "fulfilled",
      stripePaymentIntentId: "pi_fulfilled",
      fulfilledAt: new Date().toISOString(),
    });

    const failedPay = await store.create({
      vin: VIN,
      email: "failed-pay@example.com",
      amountCents: 1499,
      currency: "usd",
    });
    await store.update(failedPay.id, {
      status: "failed",
      stripePaymentIntentId: "pi_failed",
      providerError: "VinAudit timed out",
    });

    const money = await store.list(50, { statuses: MONEY_ACTIVITY_STATUSES });
    const abandoned = await store.list(50, { statuses: UNPAID_CHECKOUT_STATUSES });
    const stats = await store.stats();

    assert.deepEqual(
      money.map((order) => order.email).sort(),
      ["failed-pay@example.com", "fulfilled@example.com", "paid@example.com"],
    );
    assert.deepEqual(
      abandoned.map((order) => order.email).sort(),
      ["expired@example.com", "pending@example.com"],
    );
    assert.ok(money.every((order) => order.id !== pending.id));
    assert.equal(stats.total, 3);
    assert.equal(stats.pending, 1);
    assert.equal(stats.fulfilled, 1);
    assert.equal(stats.failed, 1);
    assert.equal(stats.abandoned, 2);
    assert.equal(stats.abandonedMonth, 2);
    assert.equal(stats.revenueCents, 1499 * 3);
  });
});
