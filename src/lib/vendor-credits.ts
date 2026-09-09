/**
 * Live vendor credit / balance / usage for the /admin console.
 *
 * Server-only. Nothing here is imported by customer pages, public /status,
 * or anonymous /api/status. Each vendor is fetched independently with a
 * short timeout. A missing official API or any failed call omits that
 * vendor rather than inventing a zero — Anthropic and Neon are skipped
 * until an admin / management key exists.
 */
import {
  emailConfig,
  fal,
  formatPrice,
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
  key: "stripe" | "fal" | "resend";
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
  | { kind: "http"; status: number; body: unknown; headers: Headers }
  | { kind: "error"; status: number; error: string };

function asOf(now: Date): string {
  return now.toISOString();
}

export function emptyVendorCredits(now: Date = new Date()): VendorCreditsReport {
  return {
    checkedAt: asOf(now),
    items: [],
    vinauditAccountUrl: isVinAuditConfigured() ? VINAUDIT_ACCOUNT_URL : undefined,
  };
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

/**
 * Resend attaches used-quota headers to authenticated responses.
 * Daily is free-plan only; monthly is the one Jason can act on.
 */
export function parseResendQuotaHeaders(
  headers: Headers,
): { used: number; period: "month" | "day" } | null {
  const monthly = headers.get("x-resend-monthly-quota");
  const daily = headers.get("x-resend-daily-quota");
  const monthN = monthly == null || monthly.trim() === "" ? Number.NaN : Number.parseInt(monthly, 10);
  if (Number.isFinite(monthN)) return { used: monthN, period: "month" };
  const dayN = daily == null || daily.trim() === "" ? Number.NaN : Number.parseInt(daily, 10);
  if (Number.isFinite(dayN)) return { used: dayN, period: "day" };
  return null;
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
        body = null;
      }
    }
    return { kind: "http", status: response.status, body, headers: response.headers };
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

  const result = await getJson(
    "https://api.stripe.com/v1/balance",
    { authorization: `Bearer ${key}` },
    fetchImpl,
    timeoutMs,
  );
  if (result.kind === "error" || result.status !== 200) return null;
  const parsed = parseStripeBalance(result.body);
  if (!parsed) return null;

  const vendor = key.startsWith("sk_test_") ? "Stripe (test)" : "Stripe";
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
  if (result.kind === "error" || result.status !== 200) return null;
  const parsed = parseFalCredits(result.body);
  if (!parsed) return null;

  return {
    vendor: "fal.ai",
    key: "fal",
    ok: true,
    metric: "Credits",
    value: formatUsdAmount(parsed.balance, parsed.currency),
    asOf: asOf(now),
  };
}

function resendFromUsage(parsed: { used: number; limit: number | null }, now: Date): VendorCredit {
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

function resendFromQuota(
  quota: { used: number; period: "month" | "day" },
  now: Date,
): VendorCredit {
  return {
    vendor: "Resend",
    key: "resend",
    ok: true,
    metric: quota.period === "month" ? "Emails this month" : "Emails today",
    value: `${formatCount(quota.used)} sent`,
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

  const auth = { authorization: `Bearer ${key}` };

  // Private-beta Usage API first. Quota headers on any authenticated
  // response are the fallback. Either failing means omit — never invent 0.
  const usage = await getJson(
    "https://api.resend.com/usage",
    auth,
    fetchImpl,
    timeoutMs,
  );
  if (usage.kind === "http") {
    if (usage.status === 200) {
      const parsed = parseResendUsage(usage.body);
      if (parsed) return resendFromUsage(parsed, now);
    }
    const fromUsageHeaders = parseResendQuotaHeaders(usage.headers);
    if (fromUsageHeaders) return resendFromQuota(fromUsageHeaders, now);
  }

  const probe = await getJson(
    "https://api.resend.com/domains",
    auth,
    fetchImpl,
    timeoutMs,
  );
  if (probe.kind === "http") {
    const fromProbe = parseResendQuotaHeaders(probe.headers);
    if (fromProbe) return resendFromQuota(fromProbe, now);
  }

  return null;
}

async function safeVendor(load: () => Promise<VendorResult>): Promise<VendorResult> {
  try {
    return await load();
  } catch {
    return null;
  }
}

/**
 * Fetches every vendor that has a usable official API, in parallel.
 *
 * Anthropic and Neon are skipped: those numbers need admin / management
 * keys we do not have. VinAudit is a refill link only.
 *
 * Never throws — a vendor outage must not take down /admin.
 */
export async function fetchVendorCredits(
  options: VendorCreditsOptions = {},
): Promise<VendorCreditsReport> {
  const now = options.now ?? new Date();
  try {
    const timeoutMs = options.timeoutMs ?? CREDIT_FETCH_TIMEOUT_MS;
    const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));

    const settled = await Promise.all([
      safeVendor(() => stripeCredits(now, fetchImpl, timeoutMs)),
      safeVendor(() => falCredits(now, fetchImpl, timeoutMs)),
      safeVendor(() => resendCredits(now, fetchImpl, timeoutMs)),
    ]);

    return {
      checkedAt: asOf(now),
      items: settled.filter((item): item is VendorCredit => item !== null),
      vinauditAccountUrl: isVinAuditConfigured() ? VINAUDIT_ACCOUNT_URL : undefined,
    };
  } catch {
    return emptyVendorCredits(now);
  }
}
