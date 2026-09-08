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
 */
export const anthropic = {
  get apiKey(): string | undefined {
    return env("ANTHROPIC_API_KEY");
  },
  get model(): string {
    return env("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001";
  },
  get baseUrl(): string {
    return env("ANTHROPIC_API_BASE") ?? "https://api.anthropic.com";
  },
  get timeoutMs(): number {
    return intEnv("ANTHROPIC_TIMEOUT_MS", 20_000);
  },
};

export function isAnthropicConfigured(): boolean {
  return Boolean(anthropic.apiKey);
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
