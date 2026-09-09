/**
 * Live vendor credit / balance / usage for the /admin console.
 *
 * Server-only. Nothing here is imported by customer pages, public /status,
 * or anonymous /api/status. Each vendor is fetched independently with a
 * short timeout; a missing official API, a 401/403 on fal, or a failed
 * Resend usage call omits that vendor rather than inventing a zero.
 */
import {
  anthropic,
  emailConfig,
  fal,
  formatPrice,
  isAnthropicAdminConfigured,
  isEmailConfigured,
  isFalBillingConfigured,
  isStripeConfigured,
  isVinAuditConfigured,
  stripeConfig,
} from "@/lib/config";

export const CREDIT_FETCH_TIMEOUT_MS = 8_000;

/** Official VinAudit client login — report keys have no balance API. */
export const VINAUDIT_ACCOUNT_URL = "https://www.vinaudit.com/client-login";

const USER_AGENT = "PullVinReport/1.0 (+https://pullvinreport.com)";

export type VendorCredit = {
  vendor: string;
  key: "stripe" | "fal" | "resend" | "anthropic";
  ok: boolean;
  metric: string;
  value: string;
  asOf: string;
  error?: string;
};

export type VendorCreditsReport = {
  checkedAt: string;
  items: VendorCredit[];
  /** Present when VinAudit is configured — a refill link, never a count. */
  vinauditAccountUrl?: string;
};

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type VendorCreditsOptions = {
  fetch?: FetchLike;
  now?: Date;
  timeoutMs?: number;
};

type VendorResult = VendorCredit | null;

type JsonResult =
  | { kind: "http"; status: number; body: unknown }
  | { kind: "error"; status: number; error: string };

function asOf(now: Date): string {
  return now.toISOString();
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatUsdAmount(amount: number, currency: string): string {
  if (currency.toUpperCase() === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }
  return `${formatCount(amount)} ${currency}`;
}

function moneyEntries(
  value: unknown,
): { amount: number; currency: string }[] {
  if (!Array.isArray(value)) return [];
  const entries: { amount: number; currency: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.amount !== "number" || !Number.isFinite(rec.amount)) continue;
    if (typeof rec.currency !== "string" || !rec.currency.trim()) continue;
    entries.push({ amount: rec.amount, currency: rec.currency.toLowerCase() });
  }
  return entries;
}

function sumUsdCents(value: unknown): number {
  return moneyEntries(value)
    .filter((entry) => entry.currency === "usd")
    .reduce((total, entry) => total + entry.amount, 0);
}

export function parseStripeBalance(
  body: unknown,
): { availableCents: number; pendingCents: number } | null {
  if (!body || typeof body !== "object") return null;
  const rec = body as Record<string, unknown>;
  if (!("available" in rec) && !("pending" in rec)) return null;
  return {
    availableCents: sumUsdCents(rec.available),
    pendingCents: sumUsdCents(rec.pending),
  };
}

export function parseFalCredits(
  body: unknown,
): { balance: number; currency: string } | null {
  if (!body || typeof body !== "object") return null;
  const credits = (body as Record<string, unknown>).credits;
  if (!credits || typeof credits !== "object") return null;
  const rec = credits as Record<string, unknown>;
  if (typeof rec.current_balance !== "number" || !Number.isFinite(rec.current_balance)) {
    return null;
  }
  const currency =
    typeof rec.currency === "string" && rec.currency.trim()
      ? rec.currency.trim()
      : "USD";
  return { balance: rec.current_balance, currency };
}

export function parseResendUsage(
  body: unknown,
): { used: number; limit: number | null } | null {
  if (!body || typeof body !== "object") return null;
  const emails = (body as Record<string, unknown>).emails;
  if (!emails || typeof emails !== "object") return null;
  const monthly = (emails as Record<string, unknown>).monthly;
  if (!monthly || typeof monthly !== "object") return null;
  const rec = monthly as Record<string, unknown>;
  if (typeof rec.used !== "number" || !Number.isFinite(rec.used)) return null;
  if (rec.limit === null || rec.limit === undefined) {
    return { used: rec.used, limit: null };
  }
  if (typeof rec.limit !== "number" || !Number.isFinite(rec.limit)) return null;
  return { used: rec.used, limit: rec.limit };
}

export function parseAnthropicCostReport(
  body: unknown,
): { totalMinor: number } | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as Record<string, unknown>).data;
  if (!Array.isArray(data)) return null;
  let totalMinor = 0;
  for (const bucket of data) {
    if (!bucket || typeof bucket !== "object") continue;
    const results = (bucket as Record<string, unknown>).results;
    if (!Array.isArray(results)) continue;
    for (const item of results) {
      if (!item || typeof item !== "object") continue;
      const amount = (item as Record<string, unknown>).amount;
      const parsed =
        typeof amount === "number"
          ? amount
          : typeof amount === "string"
            ? Number.parseFloat(amount)
            : Number.NaN;
      if (Number.isFinite(parsed)) totalMinor += parsed;
    }
  }
  return { totalMinor };
}

async function getJson(
  url: string,
  headers: Record<string, string>,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<JsonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": USER_AGENT,
        ...headers,
      },
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        return {
          kind: "error",
          status: response.status,
          error: `HTTP ${response.status} (not JSON)`,
        };
      }
    }
    return { kind: "http", status: response.status, body };
  } catch (error) {
    const aborted =
      (error instanceof Error && error.name === "AbortError") ||
      (error instanceof DOMException && error.name === "AbortError");
    return {
      kind: "error",
      status: 0,
      error: aborted ? `Timed out after ${timeoutMs}ms` : "Request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function stripeCredits(
  now: Date,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<VendorResult> {
  const key = stripeConfig.secretKey;
  if (!key || !isStripeConfigured()) return null;

  const vendor = key.startsWith("sk_test_") ? "Stripe (test)" : "Stripe";
  const failed = (error: string): VendorCredit => ({
    vendor,
    key: "stripe",
    ok: false,
    metric: "USD balance",
    value: "",
    asOf: asOf(now),
    error,
  });

  const result = await getJson(
    "https://api.stripe.com/v1/balance",
    { authorization: `Bearer ${key}` },
    fetchImpl,
    timeoutMs,
  );
  if (result.kind === "error") return failed(result.error);
  if (result.status !== 200) return failed(`HTTP ${result.status}`);

  const parsed = parseStripeBalance(result.body);
  if (!parsed) return failed("Balance reply had no USD totals");

  return {
    vendor,
    key: "stripe",
    ok: true,
    metric: "USD balance",
    value: `${formatPrice(parsed.availableCents, "usd")} available · ${formatPrice(parsed.pendingCents, "usd")} pending`,
    asOf: asOf(now),
  };
}

async function falCredits(
  now: Date,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<VendorResult> {
  const key = fal.billingKey;
  if (!key || !isFalBillingConfigured()) return null;

  const result = await getJson(
    "https://api.fal.ai/v1/account/billing?expand=credits",
    { authorization: `Key ${key}` },
    fetchImpl,
    timeoutMs,
  );
  // API-scope keys (and any other unauthorized key) are omitted — never 0.
  if (result.kind === "http" && (result.status === 401 || result.status === 403)) {
    return null;
  }
  if (result.kind === "error") {
    return {
      vendor: "fal.ai",
      key: "fal",
      ok: false,
      metric: "Credits",
      value: "",
      asOf: asOf(now),
      error: result.error,
    };
  }
  if (result.status !== 200) {
    return {
      vendor: "fal.ai",
      key: "fal",
      ok: false,
      metric: "Credits",
      value: "",
      asOf: asOf(now),
      error: `HTTP ${result.status}`,
    };
  }

  const parsed = parseFalCredits(result.body);
  if (!parsed) {
    return {
      vendor: "fal.ai",
      key: "fal",
      ok: false,
      metric: "Credits",
      value: "",
      asOf: asOf(now),
      error: "Billing reply had no credit balance",
    };
  }

  return {
    vendor: "fal.ai",
    key: "fal",
    ok: true,
    metric: "Credits",
    value: formatUsdAmount(parsed.balance, parsed.currency),
    asOf: asOf(now),
  };
}

async function resendCredits(
  now: Date,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<VendorResult> {
  const key = emailConfig.apiKey;
  if (!key || !isEmailConfigured()) return null;

  // Private-beta Usage API. Any failure is an omit — do not invent numbers.
  const result = await getJson(
    "https://api.resend.com/usage",
    { authorization: `Bearer ${key}` },
    fetchImpl,
    timeoutMs,
  );
  if (result.kind === "error" || result.status !== 200) return null;
  const parsed = parseResendUsage(result.body);
  if (!parsed) return null;

  const value =
    parsed.limit === null
      ? `${formatCount(parsed.used)} emails`
      : `${formatCount(parsed.used)} / ${formatCount(parsed.limit)}`;

  return {
    vendor: "Resend",
    key: "resend",
    ok: true,
    metric: "Emails this month",
    value,
    asOf: asOf(now),
  };
}

function costReportWindow(now: Date): { startingAt: string; endingAt: string } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const starting = new Date(today - 6 * 24 * 60 * 60 * 1000);
  const ending = new Date(today + 24 * 60 * 60 * 1000);
  return {
    startingAt: starting.toISOString().replace(/\.\d{3}Z$/, "Z"),
    endingAt: ending.toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}

async function anthropicCredits(
  now: Date,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<VendorResult> {
  const key = anthropic.adminApiKey;
  if (!key || !isAnthropicAdminConfigured()) return null;

  const failed = (error: string): VendorCredit => ({
    vendor: "Anthropic",
    key: "anthropic",
    ok: false,
    metric: "Spend · last 7 days",
    value: "",
    asOf: asOf(now),
    error,
  });

  const { startingAt, endingAt } = costReportWindow(now);
  const url = new URL(`${anthropic.baseUrl.replace(/\/+$/, "")}/v1/organizations/cost_report`);
  url.searchParams.set("starting_at", startingAt);
  url.searchParams.set("ending_at", endingAt);
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("limit", "7");

  const result = await getJson(
    url.toString(),
    {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    fetchImpl,
    timeoutMs,
  );
  if (result.kind === "error") return failed(result.error);
  if (result.status !== 200) return failed(`HTTP ${result.status}`);

  const parsed = parseAnthropicCostReport(result.body);
  if (!parsed) return failed("Cost report reply was not readable");

  return {
    vendor: "Anthropic",
    key: "anthropic",
    ok: true,
    metric: "Spend · last 7 days",
    value: formatPrice(Math.round(parsed.totalMinor), "usd"),
    asOf: asOf(now),
  };
}

/**
 * Fetches every vendor that has a usable official API, in parallel.
 *
 * Neon is omitted: `DATABASE_URL` is not a management key.
 * VinAudit is omitted as a number: report keys have no balance endpoint.
 */
export async function fetchVendorCredits(
  options: VendorCreditsOptions = {},
): Promise<VendorCreditsReport> {
  const now = options.now ?? new Date();
  const timeoutMs = options.timeoutMs ?? CREDIT_FETCH_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));

  const settled = await Promise.allSettled([
    stripeCredits(now, fetchImpl, timeoutMs),
    falCredits(now, fetchImpl, timeoutMs),
    resendCredits(now, fetchImpl, timeoutMs),
    anthropicCredits(now, fetchImpl, timeoutMs),
  ]);

  const items: VendorCredit[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) {
      items.push(result.value);
    }
  }

  return {
    checkedAt: asOf(now),
    items,
    vinauditAccountUrl: isVinAuditConfigured() ? VINAUDIT_ACCOUNT_URL : undefined,
  };
}
