import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  ANTHROPIC_CONSOLE_BILLING_URL,
  BILLING_UNAVAILABLE,
  CREDIT_FETCH_TIMEOUT_MS,
  FAL_NEEDS_ADMIN_KEY,
  VINAUDIT_ACCOUNT_URL,
  emptyVendorCredits,
  falAuthorizationHeader,
  fetchVendorCredits,
  hasAnyCreditApiConfigured,
  parseAnthropicCostReport,
  parseFalCredits,
  parseFiniteNumber,
  parseResendQuotaHeaders,
  parseResendUsage,
  parseStripeBalance,
  utcMonthToDateBounds,
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

  it("reads current_balance when fal sends a numeric string", () => {
    assert.deepEqual(
      parseFalCredits({
        credits: { current_balance: "8.25", currency: "USD" },
      }),
      { balance: 8.25, currency: "USD" },
    );
  });

  it("does not invent 0 from a missing or blank current_balance", () => {
    assert.equal(parseFalCredits({ credits: { currency: "USD" } }), null);
    assert.equal(parseFalCredits({ credits: { current_balance: "" } }), null);
    assert.equal(parseFalCredits({ credits: { current_balance: "   " } }), null);
    assert.equal(parseFalCredits({ credits: { current_balance: "n/a" } }), null);
  });

  it("refuses a billing payload with no credits expand", () => {
    assert.equal(parseFalCredits({ username: "team" }), null);
  });
});

describe("parseFiniteNumber", () => {
  it("accepts finite numbers and numeric strings, not blanks", () => {
    assert.equal(parseFiniteNumber(0), 0);
    assert.equal(parseFiniteNumber("12.5"), 12.5);
    assert.equal(parseFiniteNumber(" 3 "), 3);
    assert.equal(parseFiniteNumber(""), null);
    assert.equal(parseFiniteNumber("  "), null);
    assert.equal(parseFiniteNumber(Number.NaN), null);
  });
});

describe("falAuthorizationHeader", () => {
  it("prefixes Key once and strips a leading Key copied from the env", () => {
    assert.equal(falAuthorizationHeader("fal_admin"), "Key fal_admin");
    assert.equal(falAuthorizationHeader("Key fal_admin"), "Key fal_admin");
    assert.equal(falAuthorizationHeader("key  fal_admin  "), "Key fal_admin");
    assert.equal(falAuthorizationHeader("Key Key fal_admin"), "Key fal_admin");
  });
});

describe("utcMonthToDateBounds", () => {
  it("is the UTC month start through start-of-tomorrow so today is included", () => {
    assert.deepEqual(utcMonthToDateBounds(new Date("2026-09-09T20:16:00.000Z")), {
      startingAt: "2026-09-01T00:00:00Z",
      endingAt: "2026-09-10T00:00:00Z",
    });
  });
});

describe("parseAnthropicCostReport", () => {
  it("sums USD amounts in cents across daily buckets", () => {
    assert.deepEqual(
      parseAnthropicCostReport({
        data: [
          {
            results: [{ amount: "123.45", currency: "USD" }],
          },
          {
            results: [{ amount: 50, currency: "USD" }],
          },
        ],
      }),
      { usd: 1.7345 },
    );
  });

  it("treats an empty successful month as $0, not an unreadable payload", () => {
    assert.deepEqual(parseAnthropicCostReport({ data: [] }), { usd: 0 });
    assert.deepEqual(
      parseAnthropicCostReport({ data: [{ results: [] }] }),
      { usd: 0 },
    );
  });

  it("does not invent 0 from a missing or unreadable report", () => {
    assert.equal(parseAnthropicCostReport({}), null);
    assert.equal(
      parseAnthropicCostReport({
        data: [{ results: [{ amount: "n/a", currency: "USD" }] }],
      }),
      null,
    );
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

function stripeBalance(available: number, pending: number) {
  return async () => ({
    available: [{ amount: available, currency: "usd" }],
    pending: [{ amount: pending, currency: "usd" }],
  });
}

describe("fetchVendorCredits", () => {
  it("returns no vendor cards when nothing is configured", async () => {
    clearCreditEnv();
    assert.equal(hasAnyCreditApiConfigured(), false);
    const report = await fetchVendorCredits({
      fetch: async () => {
        throw new Error("no vendor should be fetched");
      },
      retrieveStripeBalance: async () => {
        throw new Error("Stripe should not be fetched");
      },
    });
    assert.deepEqual(report.items, []);
    assert.equal(report.vinauditAccountUrl, undefined);
    assert.equal(report.anthropicBillingUrl, undefined);
    assert.deepEqual(emptyVendorCredits().items, []);
  });

  it("includes Stripe and marks fal/Resend unavailable when those APIs fail", async () => {
    clearCreditEnv();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.FAL_KEY = "fal_api_scope";
    process.env.RESEND_API_KEY = "re_test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-regular";
    process.env.VINAUDIT_API_KEY = "va";
    process.env.VINAUDIT_USER = "user";
    process.env.VINAUDIT_PASS = "pass";
    assert.equal(hasAnyCreditApiConfigured(), true);

    const seen: string[] = [];
    const fetchImpl = mockFetch({
      "https://api.fal.ai/v1/account/billing": (url) => {
        seen.push(`${url.origin}${url.pathname}`);
        return jsonResponse(401, {});
      },
      "https://api.resend.com/usage": (url) => {
        seen.push(`${url.origin}${url.pathname}`);
        return jsonResponse(404, { message: "not found" });
      },
    });

    const report = await fetchVendorCredits({
      fetch: async (input, init) => {
        if (String(input).includes("api.stripe.com")) {
          throw new Error("Stripe must use the SDK helper, not a raw fetch");
        }
        return fetchImpl(input, init);
      },
      retrieveStripeBalance: stripeBalance(2500, 100),
    });
    assert.equal(report.items.length, 3);
    const stripe = report.items.find((item) => item.key === "stripe");
    const falItem = report.items.find((item) => item.key === "fal");
    const resend = report.items.find((item) => item.key === "resend");
    assert.equal(stripe?.ok, true);
    assert.match(stripe?.vendor ?? "", /Stripe \(test\)/);
    assert.match(stripe?.value ?? "", /\$25\.00 available/);
    assert.match(stripe?.value ?? "", /\$1\.00 pending/);
    assert.equal(falItem?.ok, false);
    assert.equal(falItem?.error, FAL_NEEDS_ADMIN_KEY);
    assert.equal(falItem?.value, "");
    assert.equal(resend?.ok, false);
    assert.equal(resend?.error, BILLING_UNAVAILABLE);
    assert.equal(resend?.value, "");
    assert.equal(report.vinauditAccountUrl, VINAUDIT_ACCOUNT_URL);
    assert.equal(report.anthropicBillingUrl, undefined);
    assert.equal(
      report.items.some((item) => "key" in item && item.key === "anthropic"),
      false,
    );
    assert.equal(
      seen.some((url) => url.includes("api.stripe.com")),
      false,
    );
  });

  it("omits Anthropic unless ANTHROPIC_ADMIN_API_KEY is set", async () => {
    clearCreditEnv();
    process.env.ANTHROPIC_API_KEY = "sk-ant-regular";
    const seen: string[] = [];
    const report = await fetchVendorCredits({
      fetch: async (input) => {
        seen.push(input);
        return jsonResponse(200, {});
      },
    });
    assert.deepEqual(report.items, []);
    assert.equal(report.anthropicBillingUrl, undefined);
    assert.equal(
      seen.some((url) => url.includes("anthropic.com")),
      false,
    );
    assert.equal(hasAnyCreditApiConfigured(), false);
    process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-test";
    assert.equal(hasAnyCreditApiConfigured(), true);
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

  it("marks fal unavailable on 403 instead of showing 0", async () => {
    clearCreditEnv();
    process.env.FAL_KEY = "fal_api_scope";
    const report = await fetchVendorCredits({
      fetch: mockFetch({
        "https://api.fal.ai/v1/account/billing": () => jsonResponse(403, {}),
      }),
    });
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0]?.key, "fal");
    assert.equal(report.items[0]?.ok, false);
    assert.equal(report.items[0]?.error, FAL_NEEDS_ADMIN_KEY);
    assert.doesNotMatch(report.items[0]?.value ?? "x", /0/);
  });

  it("says billing API unavailable with the status when an Admin-scope fal key still fails", async () => {
    clearCreditEnv();
    process.env.FAL_ADMIN_KEY = "fal_admin";
    const report401 = await fetchVendorCredits({
      fetch: mockFetch({
        "https://api.fal.ai/v1/account/billing": () => jsonResponse(401, {}),
      }),
    });
    assert.equal(report401.items[0]?.ok, false);
    assert.equal(report401.items[0]?.error, `${BILLING_UNAVAILABLE} (401)`);
    assert.equal(report401.items[0]?.value, "");

    const report403 = await fetchVendorCredits({
      fetch: mockFetch({
        "https://api.fal.ai/v1/account/billing": () => jsonResponse(403, {}),
      }),
    });
    assert.equal(report403.items[0]?.error, `${BILLING_UNAVAILABLE} (403)`);
    assert.doesNotMatch(report403.items[0]?.value ?? "x", /0/);
  });

  it("strips a leading Key from FAL_ADMIN_KEY before sending Authorization", async () => {
    clearCreditEnv();
    process.env.FAL_ADMIN_KEY = "Key fal_admin";
    const fetchImpl = mockFetch({
      "https://api.fal.ai/v1/account/billing": (_url, init) => {
        assert.equal(
          init?.headers && new Headers(init.headers).get("authorization"),
          "Key fal_admin",
        );
        return jsonResponse(200, {
          credits: { current_balance: "4", currency: "USD" },
        });
      },
    });
    const report = await fetchVendorCredits({ fetch: fetchImpl });
    assert.equal(report.items[0]?.ok, true);
    assert.equal(report.items[0]?.value, "$4.00");
  });

  it("shows Anthropic USD spend MTD for the current UTC month", async () => {
    clearCreditEnv();
    process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-test";
    const now = new Date("2026-09-09T20:16:00.000Z");
    const fetchImpl = mockFetch({
      "https://api.anthropic.com/v1/organizations/cost_report": (url, init) => {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("x-api-key"), "sk-ant-admin-test");
        assert.equal(headers.get("anthropic-version"), "2023-06-01");
        assert.equal(headers.get("authorization"), null);
        assert.equal(url.searchParams.get("starting_at"), "2026-09-01T00:00:00Z");
        assert.equal(url.searchParams.get("ending_at"), "2026-09-10T00:00:00Z");
        return jsonResponse(200, {
          data: [
            { results: [{ amount: "250", currency: "USD" }] },
            { results: [{ amount: "50", currency: "USD" }] },
          ],
        });
      },
    });
    const report = await fetchVendorCredits({ fetch: fetchImpl, now });
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0]?.key, "anthropic");
    assert.equal(report.items[0]?.ok, true);
    assert.equal(report.items[0]?.metric, "USD spend MTD");
    assert.equal(report.items[0]?.value, "$3.00");
    assert.equal(report.anthropicBillingUrl, ANTHROPIC_CONSOLE_BILLING_URL);
    assert.equal(
      Object.keys(report.items[0] ?? {}).includes("remaining"),
      false,
    );
  });

  it("marks Anthropic unavailable when Cost Report fails instead of showing $0", async () => {
    clearCreditEnv();
    process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-test";
    const report = await fetchVendorCredits({
      fetch: mockFetch({
        "https://api.anthropic.com/v1/organizations/cost_report": () =>
          jsonResponse(403, { error: { type: "forbidden" } }),
      }),
    });
    assert.equal(report.items[0]?.key, "anthropic");
    assert.equal(report.items[0]?.ok, false);
    assert.equal(report.items[0]?.error, BILLING_UNAVAILABLE);
    assert.equal(report.items[0]?.value, "");
    assert.doesNotMatch(report.items[0]?.value ?? "x", /0/);
    assert.equal(report.anthropicBillingUrl, ANTHROPIC_CONSOLE_BILLING_URL);
  });

  it("marks Resend unavailable when usage and quota headers are unreadable", async () => {
    clearCreditEnv();
    process.env.RESEND_API_KEY = "re_test";
    const report = await fetchVendorCredits({
      fetch: mockFetch({
        "https://api.resend.com/usage": () => jsonResponse(200, { object: "usage" }),
        "https://api.resend.com/domains": () => jsonResponse(200, { data: [] }),
      }),
    });
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0]?.key, "resend");
    assert.equal(report.items[0]?.ok, false);
    assert.equal(report.items[0]?.error, BILLING_UNAVAILABLE);
    assert.doesNotMatch(report.items[0]?.value ?? "x", /0/);
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

  it("marks Stripe unavailable on failure instead of inventing $0.00", async () => {
    clearCreditEnv();
    process.env.STRIPE_SECRET_KEY = "sk_live_abc";
    const report = await fetchVendorCredits({
      retrieveStripeBalance: async () => {
        throw new Error("stripe down");
      },
    });
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0]?.vendor, "Stripe");
    assert.equal(report.items[0]?.ok, false);
    assert.equal(report.items[0]?.error, BILLING_UNAVAILABLE);
    assert.doesNotMatch(report.items[0]?.value ?? "", /\$0\.00/);
  });

  it("marks Stripe unavailable when the SDK returns unusable data", async () => {
    clearCreditEnv();
    process.env.STRIPE_SECRET_KEY = "sk_live_abc";
    const report = await fetchVendorCredits({
      retrieveStripeBalance: async () => ({ object: "balance" }),
    });
    assert.equal(report.items[0]?.ok, false);
    assert.equal(report.items[0]?.error, BILLING_UNAVAILABLE);
    assert.doesNotMatch(report.items[0]?.value ?? "", /\$0\.00/);
  });

  it("never throws when a vendor fetch rejects", async () => {
    clearCreditEnv();
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.FAL_KEY = "fal_x";
    process.env.RESEND_API_KEY = "re_x";
    process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-x";
    const report = await fetchVendorCredits({
      fetch: async () => {
        throw new Error("boom");
      },
      retrieveStripeBalance: async () => {
        throw new Error("boom");
      },
    });
    assert.equal(report.items.length, 4);
    assert.ok(report.items.every((item) => item.ok === false));
    assert.ok(report.items.every((item) => item.value === ""));
    assert.equal(
      report.items.find((item) => item.key === "fal")?.error,
      BILLING_UNAVAILABLE,
    );
    assert.equal(
      report.items.find((item) => item.key === "anthropic")?.error,
      BILLING_UNAVAILABLE,
    );
  });

  it("sends the Anthropic admin key, never the Messages key", async () => {
    clearCreditEnv();
    process.env.ANTHROPIC_API_KEY = "sk-ant-regular-must-not-send";
    process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-test";
    const seen: { url: string; apiKey: string | null }[] = [];
    await fetchVendorCredits({
      fetch: async (input, init) => {
        seen.push({
          url: String(input),
          apiKey: new Headers(init?.headers).get("x-api-key"),
        });
        return jsonResponse(200, { data: [] });
      },
    });
    assert.equal(seen.length, 1);
    assert.match(seen[0]?.url ?? "", /\/v1\/organizations\/cost_report/);
    assert.equal(seen[0]?.apiKey, "sk-ant-admin-test");
    assert.equal(
      seen.some((call) => (call.apiKey ?? call.url).includes("regular-must-not-send")),
      false,
    );
  });

  it("emptyVendorCredits still lists configured vendors as unavailable", () => {
    clearCreditEnv();
    process.env.STRIPE_SECRET_KEY = "sk_live_abc";
    process.env.FAL_KEY = "fal_x";
    process.env.RESEND_API_KEY = "re_x";
    process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-test";
    const report = emptyVendorCredits();
    assert.equal(report.items.length, 4);
    assert.ok(report.items.every((item) => item.ok === false));
    assert.ok(report.items.every((item) => item.error === BILLING_UNAVAILABLE));
    assert.ok(report.items.every((item) => !/\$0\.00|\b0\b/.test(item.value)));
    assert.ok(report.items.some((item) => item.key === "anthropic"));
    assert.equal(report.anthropicBillingUrl, ANTHROPIC_CONSOLE_BILLING_URL);
  });

  it("does not put vendor keys in the outgoing URL", async () => {
    clearCreditEnv();
    process.env.STRIPE_SECRET_KEY = "sk_test_secret_value";
    process.env.FAL_ADMIN_KEY = "fal_secret_value";
    process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-secret_value";
    const seen: string[] = [];
    await fetchVendorCredits({
      fetch: async (input) => {
        seen.push(input);
        return jsonResponse(401, {});
      },
      retrieveStripeBalance: async () => {
        throw new Error("no url to leak");
      },
    });
    assert.equal(
      seen.some((url) => url.includes("secret_value")),
      false,
    );
  });

  it("loads Stripe through retrieveStripeBalance, not a raw api.stripe.com fetch", async () => {
    clearCreditEnv();
    process.env.STRIPE_SECRET_KEY = "sk_live_abc";
    let stripeFetch = 0;
    let sdkCalls = 0;
    const report = await fetchVendorCredits({
      fetch: async (input) => {
        if (String(input).includes("api.stripe.com")) stripeFetch += 1;
        return jsonResponse(500, {});
      },
      retrieveStripeBalance: async () => {
        sdkCalls += 1;
        return {
          available: [{ amount: 0, currency: "usd" }],
          pending: [{ amount: 0, currency: "usd" }],
        };
      },
    });
    assert.equal(stripeFetch, 0);
    assert.equal(sdkCalls, 1);
    assert.equal(report.items[0]?.ok, true);
    assert.match(report.items[0]?.value ?? "", /\$0\.00 available/);
  });

  it("links Anthropic remaining credits to Console Billing instead of inventing a balance", async () => {
    clearCreditEnv();
    process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-test";
    const report = await fetchVendorCredits({
      fetch: mockFetch({
        "https://api.anthropic.com/v1/organizations/cost_report": () =>
          jsonResponse(200, { data: [] }),
      }),
    });
    assert.equal(report.anthropicBillingUrl, ANTHROPIC_CONSOLE_BILLING_URL);
    assert.match(ANTHROPIC_CONSOLE_BILLING_URL, /console\.anthropic\.com\/settings\/billing/);
    assert.equal(
      report.items.some((item) => /remaining/i.test(item.metric) || /remaining/i.test(item.value)),
      false,
    );
  });

  it("uses a short per-vendor timeout", () => {
    assert.equal(CREDIT_FETCH_TIMEOUT_MS, 8_000);
  });
});
