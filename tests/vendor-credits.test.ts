import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  CREDIT_FETCH_TIMEOUT_MS,
  VINAUDIT_ACCOUNT_URL,
  fetchVendorCredits,
  parseAnthropicCostReport,
  parseFalCredits,
  parseResendUsage,
  parseStripeBalance,
  type FetchLike,
} from "@/lib/vendor-credits";

const ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "FAL_KEY",
  "FAL_ADMIN_KEY",
  "RESEND_API_KEY",
  "ANTHROPIC_ADMIN_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_API_BASE",
  "VINAUDIT_API_KEY",
  "VINAUDIT_USER",
  "VINAUDIT_PASS",
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function rememberEnv() {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearCreditEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(
  routes: Record<
    string,
    (url: URL, init?: RequestInit) => Response | Promise<Response>
  >,
): FetchLike {
  return async (input, init) => {
    const url = new URL(input);
    const handler = routes[`${url.origin}${url.pathname}`];
    if (!handler) throw new Error(`unexpected fetch ${url.href}`);
    return handler(url, init);
  };
}

rememberEnv();
afterEach(restoreEnv);

describe("parseStripeBalance", () => {
  it("sums USD available and pending and ignores other currencies", () => {
    const parsed = parseStripeBalance({
      available: [
        { amount: 1234, currency: "usd" },
        { amount: 99, currency: "eur" },
      ],
      pending: [{ amount: 50, currency: "usd" }],
    });
    assert.deepEqual(parsed, { availableCents: 1234, pendingCents: 50 });
  });

  it("does not invent a balance from an empty object", () => {
    assert.equal(parseStripeBalance({}), null);
    assert.equal(parseStripeBalance(null), null);
  });
});

describe("parseFalCredits", () => {
  it("reads current_balance from the expanded credits object", () => {
    assert.deepEqual(
      parseFalCredits({
        username: "team",
        credits: { current_balance: 24.5, currency: "USD" },
      }),
      { balance: 24.5, currency: "USD" },
    );
  });

  it("refuses a billing payload with no credits expand", () => {
    assert.equal(parseFalCredits({ username: "team" }), null);
  });
});

describe("parseResendUsage", () => {
  it("reads the monthly email quota", () => {
    assert.deepEqual(
      parseResendUsage({
        object: "usage",
        emails: { monthly: { used: 100, limit: 3000 } },
      }),
      { used: 100, limit: 3000 },
    );
  });

  it("allows a null monthly cap", () => {
    assert.deepEqual(
      parseResendUsage({
        emails: { monthly: { used: 12, limit: null } },
      }),
      { used: 12, limit: null },
    );
  });

  it("omits an unreadable payload rather than inventing 0", () => {
    assert.equal(parseResendUsage({ object: "usage" }), null);
  });
});

describe("parseAnthropicCostReport", () => {
  it("sums minor-unit amounts across buckets", () => {
    const parsed = parseAnthropicCostReport({
      data: [
        { results: [{ amount: "123.45" }, { amount: "10" }] },
        { results: [] },
        { results: [{ amount: 6.55 }] },
      ],
    });
    assert.ok(parsed);
    assert.equal(Math.round(parsed.totalMinor), 140);
  });

  it("treats an empty successful report as a real zero", () => {
    assert.deepEqual(parseAnthropicCostReport({ data: [] }), { totalMinor: 0 });
  });

  it("rejects a payload that is not a cost report", () => {
    assert.equal(parseAnthropicCostReport({ error: { type: "auth" } }), null);
  });
});

describe("fetchVendorCredits", () => {
  it("returns no vendor cards when nothing is configured", async () => {
    clearCreditEnv();
    const report = await fetchVendorCredits({
      fetch: async () => {
        throw new Error("no vendor should be fetched");
      },
    });
    assert.deepEqual(report.items, []);
    assert.equal(report.vinauditAccountUrl, undefined);
  });

  it("includes Stripe and omits fal on 401, Resend on failure, Anthropic without an admin key", async () => {
    clearCreditEnv();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.FAL_KEY = "fal_api_scope";
    process.env.RESEND_API_KEY = "re_test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-regular";
    process.env.VINAUDIT_API_KEY = "va";
    process.env.VINAUDIT_USER = "user";
    process.env.VINAUDIT_PASS = "pass";

    const fetchImpl = mockFetch({
      "https://api.stripe.com/v1/balance": () =>
        jsonResponse(200, {
          available: [{ amount: 2500, currency: "usd" }],
          pending: [{ amount: 100, currency: "usd" }],
        }),
      "https://api.fal.ai/v1/account/billing": () => jsonResponse(401, {}),
      "https://api.resend.com/usage": () => jsonResponse(404, { message: "not found" }),
    });

    const report = await fetchVendorCredits({ fetch: fetchImpl });
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0]?.key, "stripe");
    assert.equal(report.items[0]?.ok, true);
    assert.match(report.items[0]?.vendor ?? "", /Stripe \(test\)/);
    assert.match(report.items[0]?.value ?? "", /\$25\.00 available/);
    assert.match(report.items[0]?.value ?? "", /\$1\.00 pending/);
    assert.equal(report.vinauditAccountUrl, VINAUDIT_ACCOUNT_URL);
    assert.equal(
      report.items.some((item) => item.key === "fal" || item.key === "resend" || item.key === "anthropic"),
      false,
    );
  });

  it("shows fal credits when the Admin-scope key works", async () => {
    clearCreditEnv();
    process.env.FAL_ADMIN_KEY = "fal_admin";
    const fetchImpl = mockFetch({
      "https://api.fal.ai/v1/account/billing": (url) => {
        assert.equal(url.searchParams.get("expand"), "credits");
        return jsonResponse(200, {
          username: "team",
          credits: { current_balance: 8, currency: "USD" },
        });
      },
    });
    const report = await fetchVendorCredits({ fetch: fetchImpl });
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0]?.key, "fal");
    assert.equal(report.items[0]?.value, "$8.00");
  });

  it("omits fal on 403 instead of showing 0", async () => {
    clearCreditEnv();
    process.env.FAL_KEY = "fal_api_scope";
    const report = await fetchVendorCredits({
      fetch: mockFetch({
        "https://api.fal.ai/v1/account/billing": () => jsonResponse(403, {}),
      }),
    });
    assert.deepEqual(report.items, []);
  });

  it("omits Resend when the usage API is unreadable, and never invents 0", async () => {
    clearCreditEnv();
    process.env.RESEND_API_KEY = "re_test";
    const report = await fetchVendorCredits({
      fetch: mockFetch({
        "https://api.resend.com/usage": () => jsonResponse(200, { object: "usage" }),
      }),
    });
    assert.deepEqual(report.items, []);
  });

  it("includes Resend monthly usage when the beta API works", async () => {
    clearCreditEnv();
    process.env.RESEND_API_KEY = "re_test";
    const report = await fetchVendorCredits({
      fetch: mockFetch({
        "https://api.resend.com/usage": () =>
          jsonResponse(200, {
            object: "usage",
            emails: { monthly: { used: 42, limit: 3000 } },
          }),
      }),
    });
    assert.equal(report.items[0]?.key, "resend");
    assert.equal(report.items[0]?.value, "42 / 3,000");
  });

  it("includes Anthropic 7-day spend only with an admin key", async () => {
    clearCreditEnv();
    process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-test";
    const now = new Date("2026-09-09T15:00:00.000Z");
    const report = await fetchVendorCredits({
      now,
      fetch: mockFetch({
        "https://api.anthropic.com/v1/organizations/cost_report": (url) => {
          assert.equal(url.searchParams.get("starting_at"), "2026-09-03T00:00:00Z");
          assert.equal(url.searchParams.get("ending_at"), "2026-09-10T00:00:00Z");
          assert.equal(url.searchParams.get("bucket_width"), "1d");
          return jsonResponse(200, {
            data: [{ results: [{ amount: "250" }] }],
          });
        },
      }),
    });
    assert.equal(report.items[0]?.key, "anthropic");
    assert.equal(report.items[0]?.ok, true);
    assert.equal(report.items[0]?.value, "$2.50");
  });

  it("surfaces Stripe and Anthropic errors without inventing zeros", async () => {
    clearCreditEnv();
    process.env.STRIPE_SECRET_KEY = "sk_live_abc";
    process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-test";
    const report = await fetchVendorCredits({
      fetch: mockFetch({
        "https://api.stripe.com/v1/balance": () => jsonResponse(500, { error: {} }),
        "https://api.anthropic.com/v1/organizations/cost_report": () =>
          jsonResponse(401, { error: { type: "authentication_error" } }),
      }),
    });
    assert.equal(report.items.length, 2);
    assert.equal(report.items.find((item) => item.key === "stripe")?.ok, false);
    assert.equal(report.items.find((item) => item.key === "anthropic")?.ok, false);
    assert.doesNotMatch(
      report.items.map((item) => item.value).join(" "),
      /\$0\.00/,
    );
  });

  it("does not put vendor keys in the outgoing URL", async () => {
    clearCreditEnv();
    process.env.STRIPE_SECRET_KEY = "sk_test_secret_value";
    process.env.FAL_ADMIN_KEY = "fal_secret_value";
    const seen: string[] = [];
    await fetchVendorCredits({
      fetch: async (input) => {
        seen.push(input);
        return jsonResponse(401, {});
      },
    });
    assert.equal(
      seen.some((url) => url.includes("secret_value")),
      false,
    );
  });

  it("uses a short per-vendor timeout", () => {
    assert.equal(CREDIT_FETCH_TIMEOUT_MS, 8_000);
  });
});
