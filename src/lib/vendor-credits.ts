/**
 * Live vendor credit / balance / usage for the /admin console.
 *
 * Server-only. Nothing here is imported by customer pages, public /status,
 * or anonymous /api/status. Each vendor is fetched independently with a
 * short timeout. A missing official API or any failed call marks that
 * vendor unavailable rather than inventing a zero — Anthropic and Neon
 * are skipped until an admin / management key exists.
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
import { retrieveStripeBalance } from "@/lib/stripe";

export const CREDIT_FETCH_TIMEOUT_MS = 8_000;

/** Official VinAudit client login — report keys have no balance API. */
export const VINAUDIT_ACCOUNT_URL = "https://www.vinaudit.com/client-login";

export const BILLING_UNAVAILABLE = "billing API unavailable";
export const FAL_NEEDS_ADMIN_KEY = "needs Admin-scope key";

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

export type StripeBalanceRetriever = () => Promise<unknown>;

export type VendorCreditsOptions = {
  fetch?: FetchLike;
  now?: Date;
  timeoutMs?: number;
  retrieveStripeBalance?: StripeBalanceRetriever;
};

type VendorResult = VendorCredit | null;

type JsonResult =
  | { kind: "http"; status: number; body: unknown; headers: Headers }
  | { kind: "error"; status: number; error: string };

function asOf(now: Date): string {
  return now.toISOString();
}

function stripeVendorName(): string {
  return stripeConfig.secretKey?.startsWith("sk_test_") ? "Stripe (test)" : "Stripe";
}

function unavailableCredit(
  vendor: string,
  key: VendorCredit["key"],
  metric: string,
  now: Date,
  error: string,
): VendorCredit {
  return {
    vendor,
    key,
    ok: false,
    metric,
    value: "",
    asOf: asOf(now),
    error,
  };
}

function unavailableStripe(now: Date, error = BILLING_UNAVAILABLE): VendorCredit {
  return unavailableCredit(stripeVendorName(), "stripe", "USD balance", now, error);
}

function unavailableFal(now: Date, error: string): VendorCredit {
  return unavailableCredit("fal.ai", "fal", "Credits", now, error);
}

function unavailableResend(now: Date, error = BILLING_UNAVAILABLE): VendorCredit {
  return unavailableCredit("Resend", "resend", "Emails this month", now, error);
}

export function hasAnyCreditApiConfigured(): boolean {
  return isStripeConfigured() || isFalBillingConfigured() || isEmailConfigured();
}

/** Configured vendors with no live number — used when the whole fetch fails. */
export function configuredUnavailableCredits(now: Date = new Date()): VendorCredit[] {
  const items: VendorCredit[] = [];
  if (isStripeConfigured()) items.push(unavailableStripe(now));
  if (isFalBillingConfigured()) items.push(unavailableFal(now, BILLING_UNAVAILABLE));
  if (isEmailConfigured()) items.push(unavailableResend(now));
  return items;
}

export function emptyVendorCredits(now: Date = new Date()): VendorCreditsReport {
  return {
    checkedAt: asOf(now),
    items: configuredUnavailableCredits(now),
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

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

function falFailureReason(status: number): string {
  const hasAdminKey = Boolean(process.env.FAL_ADMIN_KEY?.trim());
  if ((status === 401 || status === 403) && !hasAdminKey) {
    return FAL_NEEDS_ADMIN_KEY;
  }
  return BILLING_UNAVAILABLE;
}

async function stripeCredits(
  now: Date,
  timeoutMs: number,
  retrieveBalance?: StripeBalanceRetriever,
): Promise<VendorResult> {
  if (!stripeConfig.secretKey || !isStripeConfigured()) return null;

  try {
    const load = retrieveBalance ?? retrieveStripeBalance;
    const body = await withTimeout(Promise.resolve().then(() => load()), timeoutMs);
    const parsed = parseStripeBalance(body);
    if (!parsed) return unavailableStripe(now);
    return {
      vendor: stripeVendorName(),
      key: "stripe",
      ok: true,
      metric: "USD balance",
      value: `${formatPrice(parsed.availableCents, "usd")} available · ${formatPrice(parsed.pendingCents, "usd")} pending`,
      asOf: asOf(now),
    };
  } catch {
    return unavailableStripe(now);
  }
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
  if (result.kind === "error") return unavailableFal(now, BILLING_UNAVAILABLE);
  if (result.status !== 200) return unavailableFal(now, falFailureReason(result.status));
  const parsed = parseFalCredits(result.body);
  if (!parsed) return unavailableFal(now, BILLING_UNAVAILABLE);

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
  // response are the fallback. Either failing means unavailable — never invent 0.
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

  return unavailableResend(now);
}

async function safeVendor(
  load: () => Promise<VendorResult>,
  onThrow: () => VendorResult,
): Promise<VendorResult> {
  try {
    return await load();
  } catch {
    return onThrow();
  }
}

/**
 * Fetches every vendor that has a usable official API, in parallel.
 *
 * Anthropic and Neon are skipped: those numbers need admin / management
 * keys we do not have. VinAudit is a refill link only.
 *
 * Never throws — a vendor outage must not take down /admin. Configured
 * vendors that fail are returned as unavailable, not omitted.
 */
export async function fetchVendorCredits(
  options: VendorCreditsOptions = {},
): Promise<VendorCreditsReport> {
  const now = options.now ?? new Date();
  try {
    const timeoutMs = options.timeoutMs ?? CREDIT_FETCH_TIMEOUT_MS;
    const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));

    const settled = await Promise.all([
      safeVendor(
        () => stripeCredits(now, timeoutMs, options.retrieveStripeBalance),
        () => (isStripeConfigured() ? unavailableStripe(now) : null),
      ),
      safeVendor(
        () => falCredits(now, fetchImpl, timeoutMs),
        () => (isFalBillingConfigured() ? unavailableFal(now, BILLING_UNAVAILABLE) : null),
      ),
      safeVendor(
        () => resendCredits(now, fetchImpl, timeoutMs),
        () => (isEmailConfigured() ? unavailableResend(now) : null),
      ),
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
