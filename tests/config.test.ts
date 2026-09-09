import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  BRAND,
  DEFAULT_GOOGLE_ADS_CUSTOMER_ID,
  DEFAULT_REPORT_PRICE_CENTS,
  anthropic,
  emailConfig,
  fal,
  formatPrice,
  googleAds,
  isAnthropicAdminConfigured,
  isAnthropicConfigured,
  isFalBillingConfigured,
  isFalConfigured,
  isGoogleAdsConfigured,
  pricing,
} from "../src/lib/config.ts";

const ENV_KEYS = [
  "EMAIL_FROM",
  "SUPPORT_EMAIL",
  "REPORT_PRICE_CENTS",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_TIMEOUT_MS",
  "FAL_IMAGE_MODEL",
  "FAL_IMAGE_STYLE",
];

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

  it("survives a parser that keeps the quotes the display name needs", () => {
    process.env.EMAIL_FROM = '"PullVinReport <orders@pullvinreport.com>"';
    assert.equal(emailConfig.from, "PullVinReport <orders@pullvinreport.com>");

    process.env.EMAIL_FROM = "'PullVinReport <orders@pullvinreport.com>'";
    assert.equal(emailConfig.from, "PullVinReport <orders@pullvinreport.com>");
  });

  it("falls back to the brand default when a parser mangles the value", () => {
    const fallback = `PullVinReport <orders@${BRAND.domain}>`;

    // What an unquoted `Name <address>` can degrade into.
    for (const mangled of ["PullVinReport", "PullVinReport <", '""', "   "]) {
      process.env.EMAIL_FROM = mangled;
      assert.equal(emailConfig.from, fallback, `mangled input: ${mangled}`);
    }
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

describe("the model that writes the brief", () => {
  it("defaults to Sonnet — the brief is written once and read many times", () => {
    assert.equal(anthropic.model, "claude-sonnet-5");
  });

  it("is a pinned id, so a new release cannot reword existing reports", () => {
    assert.doesNotMatch(anthropic.model, /latest/);
  });

  it("takes an override", () => {
    process.env.ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
    assert.equal(anthropic.model, "claude-haiku-4-5-20251001");
  });

  it("waits long enough for a brief that explains itself", () => {
    // 20s and 1000 tokens cut the JSON off around 428 characters on ZOO.
    delete process.env.ANTHROPIC_TIMEOUT_MS;
    assert.equal(anthropic.timeoutMs, 45_000);
  });

  it("is off, not broken, when no key is set", () => {
    const before = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      assert.equal(isAnthropicConfigured(), false);
      assert.equal(anthropic.apiKey, undefined);
    } finally {
      if (before !== undefined) process.env.ANTHROPIC_API_KEY = before;
    }
  });

  it("keeps the Cost Report admin key separate from the Messages key", () => {
    const messages = process.env.ANTHROPIC_API_KEY;
    const admin = process.env.ANTHROPIC_ADMIN_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_ADMIN_API_KEY;
    try {
      assert.equal(isAnthropicAdminConfigured(), false);
      assert.equal(anthropic.adminApiKey, undefined);
      process.env.ANTHROPIC_API_KEY = "sk-ant-regular";
      assert.equal(isAnthropicConfigured(), true);
      assert.equal(isAnthropicAdminConfigured(), false);
      process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-test";
      assert.equal(anthropic.adminApiKey, "sk-ant-admin-test");
      assert.equal(isAnthropicAdminConfigured(), true);
    } finally {
      if (messages === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = messages;
      if (admin === undefined) delete process.env.ANTHROPIC_ADMIN_API_KEY;
      else process.env.ANTHROPIC_ADMIN_API_KEY = admin;
    }
  });
});

describe("the model that draws the vehicle hero", () => {
  it("defaults to Recraft V3 digital illustration, not a photoreal Flux pass", () => {
    assert.equal(fal.model, "fal-ai/recraft/v3/text-to-image");
    assert.equal(fal.style, "digital_illustration");
    assert.equal(fal.rembgModel, "fal-ai/imageutils/rembg");
  });

  it("takes an override for operators who want a cheaper Flux pass", () => {
    process.env.FAL_IMAGE_MODEL = "fal-ai/flux/schnell";
    process.env.FAL_IMAGE_STYLE = "any";
    assert.equal(fal.model, "fal-ai/flux/schnell");
    assert.equal(fal.style, "any");
  });

  it("refuses a photoreal Recraft style so an env typo cannot look like this VIN", () => {
    process.env.FAL_IMAGE_STYLE = "realistic_image";
    assert.equal(fal.style, "digital_illustration");
  });

  it("is off, not broken, when no key is set", () => {
    const before = process.env.FAL_KEY;
    delete process.env.FAL_KEY;
    try {
      assert.equal(isFalConfigured(), false);
      assert.equal(fal.apiKey, undefined);
    } finally {
      if (before !== undefined) process.env.FAL_KEY = before;
    }
  });

  it("prefers FAL_ADMIN_KEY for billing and still accepts FAL_KEY", () => {
    const api = process.env.FAL_KEY;
    const admin = process.env.FAL_ADMIN_KEY;
    delete process.env.FAL_KEY;
    delete process.env.FAL_ADMIN_KEY;
    try {
      assert.equal(isFalBillingConfigured(), false);
      process.env.FAL_KEY = "fal_api";
      assert.equal(fal.billingKey, "fal_api");
      process.env.FAL_ADMIN_KEY = "fal_admin";
      assert.equal(fal.billingKey, "fal_admin");
    } finally {
      if (api === undefined) delete process.env.FAL_KEY;
      else process.env.FAL_KEY = api;
      if (admin === undefined) delete process.env.FAL_ADMIN_KEY;
      else process.env.FAL_ADMIN_KEY = admin;
    }
  });
});

describe("Google Ads admin spend config", () => {
  it("omits Google Ads until all four official Ads API vars are set, and strips MCC ids", () => {
    const keys = [
      "GOOGLE_ADS_DEVELOPER_TOKEN",
      "GOOGLE_ADS_CLIENT_ID",
      "GOOGLE_ADS_CLIENT_SECRET",
      "GOOGLE_ADS_REFRESH_TOKEN",
      "GOOGLE_ADS_CUSTOMER_ID",
      "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
    ] as const;
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    try {
      assert.equal(isGoogleAdsConfigured(), false);
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev";
      process.env.GOOGLE_ADS_CLIENT_ID = "client";
      process.env.GOOGLE_ADS_CLIENT_SECRET = "secret";
      assert.equal(isGoogleAdsConfigured(), false);
      process.env.GOOGLE_ADS_REFRESH_TOKEN = "refresh";
      assert.equal(isGoogleAdsConfigured(), true);
      assert.equal(googleAds.customerId, DEFAULT_GOOGLE_ADS_CUSTOMER_ID);
      assert.equal(googleAds.loginCustomerId, undefined);
      process.env.GOOGLE_ADS_CUSTOMER_ID = "754-476-2158";
      process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = "123-456-7890";
      assert.equal(googleAds.customerId, "7544762158");
      assert.equal(googleAds.loginCustomerId, "1234567890");
    } finally {
      for (const key of keys) {
        const value = saved[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
