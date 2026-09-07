import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  BRAND,
  DEFAULT_REPORT_PRICE_CENTS,
  emailConfig,
  formatPrice,
  pricing,
} from "../src/lib/config.ts";

const ENV_KEYS = ["EMAIL_FROM", "SUPPORT_EMAIL", "REPORT_PRICE_CENTS"];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("outbound email identity", () => {
  it("defaults the sender to PullVinReport on its own domain", () => {
    assert.equal(emailConfig.from, `PullVinReport <orders@${BRAND.domain}>`);
    assert.equal(emailConfig.supportEmail, `support@${BRAND.domain}`);
  });

  it("never defaults to another brand's domain", () => {
    for (const value of [emailConfig.from, emailConfig.supportEmail]) {
      assert.match(value, /@pullvinreport\.com>?$/);
      assert.doesNotMatch(value, /whatisthecode/i);
    }
  });

  it("still honours an explicit override", () => {
    process.env.EMAIL_FROM = "PullVinReport <hello@pullvinreport.com>";
    process.env.SUPPORT_EMAIL = "help@pullvinreport.com";
    assert.equal(emailConfig.from, "PullVinReport <hello@pullvinreport.com>");
    assert.equal(emailConfig.supportEmail, "help@pullvinreport.com");
  });
});

describe("pricing", () => {
  it("defaults to $14.99", () => {
    assert.equal(pricing.amountCents, DEFAULT_REPORT_PRICE_CENTS);
    assert.equal(pricing.amountCents, 1499);
    assert.equal(formatPrice(), "$14.99");
  });

  it("is environment-configurable", () => {
    process.env.REPORT_PRICE_CENTS = "1999";
    assert.equal(pricing.amountCents, 1999);
    assert.equal(formatPrice(), "$19.99");
  });

  it("ignores a nonsense price rather than selling at zero", () => {
    process.env.REPORT_PRICE_CENTS = "not-a-number";
    assert.equal(pricing.amountCents, DEFAULT_REPORT_PRICE_CENTS);
  });
});
