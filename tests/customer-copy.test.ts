import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CHECKOUT_UNAVAILABLE_REASON,
  ORDERING_PAUSED_REASON,
  PAYMENT_CANCELED_MESSAGE,
  PAYMENT_PENDING_MESSAGE,
  classifyFailure,
  customerFailureMessage,
  refundPromise,
} from "../src/lib/customer-copy.ts";

/** Anything a buyer must never read. */
const INTERNALS =
  /VINAUDIT_|STRIPE_|RESEND_|DATABASE_URL|ADMIN_PASSWORD|VinAudit|Stripe secret|process\.env/;

const RAW_ERRORS = [
  "VinAudit is not configured (missing VINAUDIT_API_KEY, VINAUDIT_USER). This paid order cannot be fulfilled",
  "Stripe is not configured. Set STRIPE_SECRET_KEY to accept payments.",
  "VinAudit returned HTTP 502",
  "VinAudit did not respond within 25000ms",
  "VinAudit could not produce a report for this VIN",
  "connect ECONNREFUSED 10.1.2.3:5432",
  "",
  null,
  undefined,
];

describe("customer failure copy", () => {
  it("never leaks credentials or provider internals", () => {
    for (const raw of RAW_ERRORS) {
      const message = customerFailureMessage(classifyFailure(raw));
      assert.doesNotMatch(
        message,
        INTERNALS,
        `leaked internals for input: ${String(raw)}`,
      );
    }
  });

  it("keeps the static banners free of internals too", () => {
    for (const copy of [
      ORDERING_PAUSED_REASON,
      CHECKOUT_UNAVAILABLE_REASON,
      PAYMENT_PENDING_MESSAGE,
      PAYMENT_CANCELED_MESSAGE,
    ]) {
      assert.doesNotMatch(copy, INTERNALS);
    }
  });

  it("tells a buyer when the VIN simply has no records", () => {
    assert.equal(
      classifyFailure("VinAudit could not produce a report for this VIN"),
      "no-records",
    );
    assert.match(customerFailureMessage("no-records"), /No history records/);
  });

  it("treats missing credentials and transport errors as provider downtime", () => {
    assert.equal(
      classifyFailure("VinAudit is not configured (missing VINAUDIT_API_KEY)"),
      "provider-unavailable",
    );
    assert.equal(classifyFailure("VinAudit returned HTTP 503"), "provider-unavailable");
    assert.equal(
      classifyFailure("Could not reach VinAudit: socket hang up"),
      "provider-unavailable",
    );
  });

  it("falls back to the generic message for anything unrecognised", () => {
    assert.equal(classifyFailure("connect ECONNREFUSED 10.1.2.3:5432"), "unknown");
    assert.equal(classifyFailure(null), "unknown");
  });
});

describe("refund promise", () => {
  it("promises a refund while the money is still ours", () => {
    const copy = refundPromise("$14.99", false);
    assert.match(copy, /\$14\.99/);
    assert.match(copy, /retry/i);
  });

  it("confirms the refund once it has been sent back", () => {
    const copy = refundPromise("$14.99", true);
    assert.match(copy, /refunded the \$14\.99/i);
    assert.doesNotMatch(copy, /retry/i);
  });
});
