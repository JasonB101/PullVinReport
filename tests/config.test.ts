import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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
  legacyDomainRedirects,
  pricing,
  siteUrl,
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

describe("brand identity", () => {
  it("is Vehicle History by VIN on the canonical host", () => {
    assert.equal(BRAND.name, "Vehicle History by VIN");
    assert.equal(BRAND.shortName, "Vehicle History");
    assert.equal(BRAND.domain, "vehiclehistorybyvin.com");
    assert.equal(BRAND.url, "https://vehiclehistorybyvin.com");
    assert.equal(BRAND.filePrefix, "VehicleHistoryByVIN");
    assert.doesNotMatch(BRAND.name, /PullVinReport|Pull Vin Report/i);
    assert.doesNotMatch(BRAND.domain, /pullvinreport/i);
  });

  it("308s the retired hosts onto the canonical URL", () => {
    const redirects = legacyDomainRedirects();
    assert.deepEqual(
      redirects.map((rule) => rule.has[0]?.value),
      ["pullvinreport.com", "www.pullvinreport.com"],
    );
    for (const rule of redirects) {
      assert.equal(rule.permanent, true);
      assert.equal(rule.destination, `${BRAND.url}/:path*`);
    }
  });

  it("wires those redirects through next.config", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../next.config.ts", import.meta.url)),
      "utf8",
    );
    assert.match(source, /legacyDomainRedirects/);
  });

  it("documents the new domain in .env.example", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../.env.example", import.meta.url)),
      "utf8",
    );
    assert.match(source, /EMAIL_FROM="Vehicle History by VIN <orders@vehiclehistorybyvin\.com>"/);
    assert.match(source, /SUPPORT_EMAIL=support@vehiclehistorybyvin\.com/);
    assert.match(source, /NEXT_PUBLIC_SITE_URL=https:\/\/vehiclehistorybyvin\.com/);
    assert.doesNotMatch(source, /orders@pullvinreport\.com/);
  });
});

describe("site URL", () => {
  const KEYS = ["NEXT_PUBLIC_SITE_URL", "SITE_URL", "VERCEL_URL", "VERCEL_ENV"] as const;

  function withEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>, run: () => void) {
    const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    for (const key of KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      run();
    } finally {
      for (const key of KEYS) {
        const value = saved[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it("prefers NEXT_PUBLIC_SITE_URL, then SITE_URL, and strips a trailing slash", () => {
    withEnv(
      { NEXT_PUBLIC_SITE_URL: "https://vehiclehistorybyvin.com/", SITE_URL: "https://ignored.example" },
      () => assert.equal(siteUrl(), BRAND.url),
    );
    withEnv(
      { NEXT_PUBLIC_SITE_URL: undefined, SITE_URL: "https://vehiclehistorybyvin.com/" },
      () => assert.equal(siteUrl(), BRAND.url),
    );
  });

  it("uses the canonical host on Vercel production when no URL is set", () => {
    withEnv(
      { NEXT_PUBLIC_SITE_URL: undefined, SITE_URL: undefined, VERCEL_ENV: "production", VERCEL_URL: "preview.vercel.app" },
      () => assert.equal(siteUrl(), BRAND.url),
    );
  });

  it("keeps preview and local hosts off the production domain", () => {
    withEnv(
      { NEXT_PUBLIC_SITE_URL: undefined, SITE_URL: undefined, VERCEL_ENV: "preview", VERCEL_URL: "pr-1.vercel.app" },
      () => assert.equal(siteUrl(), "https://pr-1.vercel.app"),
    );
    withEnv(
      { NEXT_PUBLIC_SITE_URL: undefined, SITE_URL: undefined, VERCEL_ENV: undefined, VERCEL_URL: undefined },
      () => assert.equal(siteUrl(), "http://localhost:3000"),
    );
  });
});

describe("outbound email identity", () => {
  it("defaults the sender to Vehicle History by VIN on its own domain", () => {
    assert.equal(emailConfig.from, `${BRAND.name} <orders@${BRAND.domain}>`);
    assert.equal(emailConfig.supportEmail, `support@${BRAND.domain}`);
  });

  it("never defaults to another brand's domain", () => {
    const own = new RegExp(`@${BRAND.domain.replaceAll(".", "\\.")}>?$`);
    for (const value of [emailConfig.from, emailConfig.supportEmail]) {
      assert.match(value, own);
      assert.doesNotMatch(value, /whatisthecode/i);
      assert.doesNotMatch(value, /pullvinreport/i);
    }
  });

  it("still honours an explicit override", () => {
    process.env.EMAIL_FROM = `${BRAND.name} <hello@${BRAND.domain}>`;
    process.env.SUPPORT_EMAIL = `help@${BRAND.domain}`;
    assert.equal(emailConfig.from, `${BRAND.name} <hello@${BRAND.domain}>`);
    assert.equal(emailConfig.supportEmail, `help@${BRAND.domain}`);
  });

  it("survives a parser that keeps the quotes the display name needs", () => {
    process.env.EMAIL_FROM = `"${BRAND.name} <orders@${BRAND.domain}>"`;
    assert.equal(emailConfig.from, `${BRAND.name} <orders@${BRAND.domain}>`);

    process.env.EMAIL_FROM = `'${BRAND.name} <orders@${BRAND.domain}>'`;
    assert.equal(emailConfig.from, `${BRAND.name} <orders@${BRAND.domain}>`);
  });

  it("falls back to the brand default when a parser mangles the value", () => {
    const fallback = `${BRAND.name} <orders@${BRAND.domain}>`;

    // What an unquoted `Name <address>` can degrade into.
    for (const mangled of [BRAND.name, `${BRAND.name} <`, '""', "   "]) {
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
