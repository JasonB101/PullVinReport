/**
 * Central environment configuration for PullVinReport.
 *
 * Every value that changes between environments is read here so the rest of the
 * app can ask simple questions like "is the provider configured?" instead of
 * poking at `process.env` in a dozen places.
 */

export const BRAND = {
  name: "PullVinReport",
  domain: "pullvinreport.com",
  tagline: "Pull the full history before you pull out your wallet.",
} as const;

function env(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function boolEnv(key: string, fallback: boolean): boolean {
  const raw = env(key)?.toLowerCase();
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

function intEnv(key: string, fallback: number): number {
  const raw = env(key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const DEFAULT_REPORT_PRICE_CENTS = 1499;

export const pricing = {
  get amountCents(): number {
    return intEnv("REPORT_PRICE_CENTS", DEFAULT_REPORT_PRICE_CENTS);
  },
  get currency(): string {
    return (env("REPORT_CURRENCY") ?? "usd").toLowerCase();
  },
};

export function formatPrice(
  cents: number = pricing.amountCents,
  currency: string = pricing.currency,
): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export const vinaudit = {
  get apiKey(): string | undefined {
    return env("VINAUDIT_API_KEY");
  },
  get username(): string | undefined {
    return env("VINAUDIT_USER");
  },
  get password(): string | undefined {
    return env("VINAUDIT_PASS");
  },
  get baseUrl(): string {
    return env("VINAUDIT_API_BASE") ?? "https://api.vinaudit.com";
  },
  get timeoutMs(): number {
    return intEnv("VINAUDIT_TIMEOUT_MS", 25_000);
  },
};

/**
 * The paid path is only allowed to run when all three VinAudit credentials are
 * present. There is deliberately no fallback: an unconfigured provider must
 * fail loudly rather than hand a customer sample data.
 */
export function isVinAuditConfigured(): boolean {
  return Boolean(vinaudit.apiKey && vinaudit.username && vinaudit.password);
}

export function missingVinAuditKeys(): string[] {
  const missing: string[] = [];
  if (!vinaudit.apiKey) missing.push("VINAUDIT_API_KEY");
  if (!vinaudit.username) missing.push("VINAUDIT_USER");
  if (!vinaudit.password) missing.push("VINAUDIT_PASS");
  return missing;
}

/**
 * The model that writes the buyer's brief.
 *
 * Optional everywhere: with no key the brief is simply not offered, and nothing
 * about buying or reading a report changes.
 *
 * Sonnet by default. The brief is written once per order and then cached, so
 * the cost of the better writer is paid once and read many times — and the two
 * things that make the brief worth having, keeping the model-level notes apart
 * from the car's own records and phrasing a finding a buyer can act on, are
 * exactly what a smaller model gets wrong. `ANTHROPIC_MODEL` overrides it; the
 * ID is a pinned snapshot rather than a moving pointer, so a new release cannot
 * change how existing reports read without someone choosing it.
 */
export const anthropic = {
  get apiKey(): string | undefined {
    return env("ANTHROPIC_API_KEY");
  },
  /**
   * Admin API key (`sk-ant-admin…`) for /admin USD spend. The Messages
   * `ANTHROPIC_API_KEY` cannot read Cost Report and is never used here.
   */
  get adminApiKey(): string | undefined {
    return env("ANTHROPIC_ADMIN_API_KEY");
  },
  get model(): string {
    return env("ANTHROPIC_MODEL") ?? "claude-sonnet-5";
  },
  get baseUrl(): string {
    return env("ANTHROPIC_API_BASE") ?? "https://api.anthropic.com";
  },
  /**
   * How long a page view waits. Nothing the buyer paid for is behind it — the
   * records are already on screen — so this can afford to be patient, and a
   * brief that explains its findings is a longer answer than one that lists
   * them.
   */
  get timeoutMs(): number {
    return intEnv("ANTHROPIC_TIMEOUT_MS", 45_000);
  },
};

export function isAnthropicConfigured(): boolean {
  return Boolean(anthropic.apiKey);
}

export function isAnthropicAdminConfigured(): boolean {
  return Boolean(anthropic.adminApiKey);
}

/** PullVinReport Google Ads customer — digits only, no dashes. */
export const DEFAULT_GOOGLE_ADS_CUSTOMER_ID = "7544762158";

export const GOOGLE_ADS_OAUTH_SCOPE = "https://www.googleapis.com/auth/adwords";

function digitsEnv(key: string): string | undefined {
  const raw = env(key);
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  return digits.length > 0 ? digits : undefined;
}

/**
 * Official Google Ads API credentials for /admin spend today + MTD.
 *
 * All four auth values must be present or the tile is omitted — never
 * shown as $0.00. `GOOGLE_ADS_CUSTOMER_ID` defaults to the PullVinReport
 * account. Developer tokens are issued on a manager (MCC) account, so
 * `GOOGLE_ADS_LOGIN_CUSTOMER_ID` is required on that path and is sent as
 * `login-customer-id`. Leave it unset only for a direct-account token;
 * the header is then omitted.
 */
export const googleAds = {
  get developerToken(): string | undefined {
    return env("GOOGLE_ADS_DEVELOPER_TOKEN");
  },
  get clientId(): string | undefined {
    return env("GOOGLE_ADS_CLIENT_ID");
  },
  get clientSecret(): string | undefined {
    return env("GOOGLE_ADS_CLIENT_SECRET");
  },
  get refreshToken(): string | undefined {
    return env("GOOGLE_ADS_REFRESH_TOKEN");
  },
  get customerId(): string {
    return digitsEnv("GOOGLE_ADS_CUSTOMER_ID") ?? DEFAULT_GOOGLE_ADS_CUSTOMER_ID;
  },
  get loginCustomerId(): string | undefined {
    return digitsEnv("GOOGLE_ADS_LOGIN_CUSTOMER_ID");
  },
};

export function isGoogleAdsConfigured(): boolean {
  return Boolean(
    googleAds.developerToken &&
      googleAds.clientId &&
      googleAds.clientSecret &&
      googleAds.refreshToken,
  );
}

/**
 * Illustrated vehicle hero on the paid report.
 *
 * Optional: with no key the report is unchanged and no image is requested.
 * Recraft V3 (`fal-ai/recraft/v3/text-to-image`) is the default because it
 * has a `digital_illustration` style lock — Recraft V4 on fal has no style
 * preset and leans photoreal. `FAL_IMAGE_MODEL` overrides it. Photoreal
 * Recraft styles are ignored so an env typo cannot turn the hero into a
 * photograph of “this VIN”.
 */
export const fal = {
  get apiKey(): string | undefined {
    return env("FAL_KEY");
  },
  get model(): string {
    return env("FAL_IMAGE_MODEL") ?? "fal-ai/recraft/v3/text-to-image";
  },
  get style(): string {
    const requested = env("FAL_IMAGE_STYLE") ?? "digital_illustration";
    return requested.toLowerCase().includes("realistic")
      ? "digital_illustration"
      : requested;
  },
  get baseUrl(): string {
    return env("FAL_API_BASE") ?? "https://fal.run";
  },
  get timeoutMs(): number {
    return intEnv("FAL_TIMEOUT_MS", 45_000);
  },
  /**
   * Recraft does not return alpha. After the drawing we cut the background
   * with this model so the card can sit the vehicle on the aurora.
   */
  get rembgModel(): string {
    return env("FAL_REMBG_MODEL") ?? "fal-ai/imageutils/rembg";
  },
  get adminKey(): string | undefined {
    return env("FAL_ADMIN_KEY");
  },
  /**
   * Key for the Platform billing API. Prefers an Admin-scope `FAL_ADMIN_KEY`
   * and falls back to `FAL_KEY`. An API-scope key 401/403s; /admin then
   * shows fal as unavailable (needs Admin-scope key) rather than inventing
   * a zero balance.
   */
  get billingKey(): string | undefined {
    return fal.adminKey ?? fal.apiKey;
  },
};

export function isFalConfigured(): boolean {
  return Boolean(fal.apiKey);
}

export function isFalBillingConfigured(): boolean {
  return Boolean(fal.billingKey);
}

export const stripeConfig = {
  get secretKey(): string | undefined {
    return env("STRIPE_SECRET_KEY");
  },
  get webhookSecret(): string | undefined {
    return env("STRIPE_WEBHOOK_SECRET");
  },
};

export function isStripeConfigured(): boolean {
  return Boolean(stripeConfig.secretKey);
}

/**
 * When true, a paid order whose report pull fails is refunded immediately
 * instead of waiting for an operator to retry it in `/admin`.
 *
 * Off by default: the documented flow is retry-then-refund, and a refunded
 * charge cannot be retried without asking the customer to pay again.
 */
export function autoRefundFailedOrders(): boolean {
  return boolEnv("AUTO_REFUND_FAILED_ORDERS", false);
}

/**
 * Reads an address-valued variable.
 *
 * `EMAIL_FROM` uses the `Name <address>` display-name form, which has to be
 * quoted in a .env file because unquoted angle brackets are shell redirection.
 * Some hosts and parsers hand the wrapping quotes back to us, and some mangle
 * the value on the way through, so the quotes are stripped here and anything
 * that no longer looks like an address falls back to the brand default rather
 * than being handed to Resend.
 */
function emailEnv(key: string, fallback: string): string {
  const raw = env(key);
  if (!raw) return fallback;
  const unquoted = raw.replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
  return unquoted.includes("@") ? unquoted : fallback;
}

export const emailConfig = {
  get apiKey(): string | undefined {
    return env("RESEND_API_KEY");
  },
  /**
   * Outbound sender. Both defaults are derived from BRAND so an unset or
   * broken environment can only ever send as PullVinReport on its own domain.
   */
  get from(): string {
    return emailEnv("EMAIL_FROM", `${BRAND.name} <orders@${BRAND.domain}>`);
  },
  get supportEmail(): string {
    return emailEnv("SUPPORT_EMAIL", `support@${BRAND.domain}`);
  },
};

export function isEmailConfigured(): boolean {
  return Boolean(emailConfig.apiKey);
}

export const databaseUrl = (): string | undefined => env("DATABASE_URL");

export function isPostgresConfigured(): boolean {
  return Boolean(databaseUrl());
}

export const adminConfig = {
  get password(): string | undefined {
    return env("ADMIN_PASSWORD");
  },
};

export function isAdminConfigured(): boolean {
  return Boolean(adminConfig.password);
}

export function siteUrl(): string {
  const explicit = env("NEXT_PUBLIC_SITE_URL") ?? env("SITE_URL");
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = env("VERCEL_URL");
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
