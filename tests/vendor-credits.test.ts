import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  CREDIT_FETCH_TIMEOUT_MS,
  VINAUDIT_ACCOUNT_URL,
  fetchVendorCredits,
  parseFalCredits,
  parseResendQuotaHeaders,
  parseResendUsage,
  parseStripeBalance,
  type FetchLike,
} from "@/lib/vendor-credits";

const ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "FAL_KEY",
  "FAL_ADMIN_KEY",
  "RESEND_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_ADMIN_API_KEY",
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

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
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
    if (!handler) return new Response("not found", { status: 404 });
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

describe("parseResendQuotaHeaders", () => {
  it("prefers the monthly used-quota header", () => {
    assert.deepEqual(
      parseResendQuotaHeaders(
        new Headers({
          "x-resend-monthly-quota": "42",
          "x-resend-daily-quota": "3",
        }),
      ),
      { used: 42, period: "month" },
    );
  });

  it("falls back to the daily header", () => {
    assert.deepEqual(
      parseResendQuotaHeaders(new Headers({ "x-resend-daily-quota": "7" })),
      { used: 7, period: "day" },
    );
  });

  it("does not invent a number from missing headers", () => {
    assert.equal(parseResendQuotaHeaders(new Headers()), null);
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

  it("includes Stripe and omits fal/Resend/Anthropic when those APIs fail", async () => {
    clearCreditEnv();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.FAL_KEY = "fal_api_scope";
    process.env.RESEND_API_KEY = "re_test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-regular";
    process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-test";
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
      report.items.some((item) => item.key === "fal" || item.key === "resend"),
      false,
    );
    assert.equal(
      report.items.some((item) => "key" in item && item.key === "anthropic"),
      false,
    );
  });

  it("never calls Anthropic even when an admin key is set", async () => {
    clearCreditEnv();
    process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-test";
    const seen: string[] = [];
    const report = await fetchVendorCredits({
      fetch: async (input) => {
        seen.push(input);
        return jsonResponse(200, {});
      },
    });
    assert.deepEqual(report.items, []);
    assert.equal(
      seen.some((url) => url.includes("anthropic.com")),
      false,
    );
  });

  it("shows fal credits when FAL_ADMIN_KEY works, preferring it over FAL_KEY", async () => {
    clearCreditEnv();
    process.env.FAL_KEY = "fal_api";
    process.env.FAL_ADMIN_KEY = "fal_admin";
    const fetchImpl = mockFetch({
      "https://api.fal.ai/v1/account/billing": (url, init) => {
        assert.equal(url.searchParams.get("expand"), "credits");
        assert.equal(init?.headers && new Headers(init.headers).get("authorization"), "Key fal_admin");
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

  it("falls back to FAL_KEY when FAL_ADMIN_KEY is unset", async () => {
    clearCreditEnv();
    process.env.FAL_KEY = "fal_api";
    const fetchImpl = mockFetch({
      "https://api.fal.ai/v1/account/billing": (_url, init) => {
        assert.equal(init?.headers && new Headers(init.headers).get("authorization"), "Key fal_api");
        return jsonResponse(200, {
          credits: { current_balance: 3.5, currency: "USD" },
        });
      },
    });
    const report = await fetchVendorCredits({ fetch: fetchImpl });
    assert.equal(report.items[0]?.value, "$3.50");
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

  it("omits Resend when usage and quota headers are unreadable", async () => {
    clearCreditEnv();
    process.env.RESEND_API_KEY = "re_test";
    const report = await fetchVendorCredits({
      fetch: mockFetch({
        "https://api.resend.com/usage": () => jsonResponse(200, { object: "usage" }),
        "https://api.resend.com/domains": () => jsonResponse(200, { data: [] }),
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

  it("falls back to Resend quota headers when /usage is unavailable", async () => {
    clearCreditEnv();
    process.env.RESEND_API_KEY = "re_test";
    const report = await fetchVendorCredits({
      fetch: mockFetch({
        "https://api.resend.com/usage": () => jsonResponse(404, { name: "not_found" }),
        "https://api.resend.com/domains": () =>
          jsonResponse(200, { data: [] }, { "x-resend-monthly-quota": "18" }),
      }),
    });
    assert.equal(report.items[0]?.key, "resend");
    assert.equal(report.items[0]?.metric, "Emails this month");
    assert.equal(report.items[0]?.value, "18 sent");
  });

  it("omits Stripe on failure instead of inventing $0.00", async () => {
    clearCreditEnv();
    process.env.STRIPE_SECRET_KEY = "sk_live_abc";
    const report = await fetchVendorCredits({
      fetch: mockFetch({
        "https://api.stripe.com/v1/balance": () => jsonResponse(500, { error: {} }),
      }),
    });
    assert.deepEqual(report.items, []);
  });

  it("never throws when a vendor fetch rejects", async () => {
    clearCreditEnv();
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.FAL_KEY = "fal_x";
    process.env.RESEND_API_KEY = "re_x";
    const report = await fetchVendorCredits({
      fetch: async () => {
        throw new Error("boom");
      },
    });
    assert.deepEqual(report.items, []);
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
