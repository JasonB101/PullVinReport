import {
  anthropic,
  emailConfig,
  fal,
  formatPrice,
  isAdminConfigured,
  isAnthropicConfigured,
  isEmailConfigured,
  isFalConfigured,
  isStripeConfigured,
  isVinAuditConfigured,
  missingVinAuditKeys,
  pricing,
  siteUrl,
  stripeConfig,
} from "@/lib/config";
import { getStore } from "@/lib/store";
import { isStripeTestMode } from "@/lib/stripe";
import { probeVinAudit } from "@/lib/vinaudit";

export type CheckState = "ready" | "degraded" | "down" | "optional";

/**
 * How much a green check actually proves.
 *
 * `probed` means we talked to the dependency while building this report.
 * `config-only` means we saw credentials and nothing else — no request was
 * made, so the first real use is still the first proof. Email is the one that
 * bites: a present `RESEND_API_KEY` says nothing about whether the key is
 * valid or the sending domain is verified, and we deliberately do not burn a
 * live send to find out.
 */
export type CheckVerification = "probed" | "config-only";

export type StatusCheck = {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
  /** True when the paid path cannot run without this check passing. */
  required: boolean;
  verification: CheckVerification;
};

export type StatusReport = {
  brand: string;
  checkedAt: string;
  /** Can a customer buy and receive a report right now? */
  ordersEnabled: boolean;
  price: string;
  priceCents: number;
  currency: string;
  siteUrl: string;
  checks: StatusCheck[];
};

export async function buildStatusReport(
  options: { probeProvider?: boolean } = {},
): Promise<StatusReport> {
  const { probeProvider = true } = options;
  const store = getStore();

  const vinauditConfigured = isVinAuditConfigured();
  const providerProbe =
    vinauditConfigured && probeProvider
      ? await probeVinAudit()
      : {
          ok: vinauditConfigured,
          detail: vinauditConfigured
            ? "Credentials present (endpoint not probed)"
            : `Missing ${missingVinAuditKeys().join(", ")}`,
        };

  const storagePing = await store.ping();

  const checks: StatusCheck[] = [
    {
      key: "vinaudit",
      label: "VinAudit Vehicle History API",
      required: true,
      verification:
        vinauditConfigured && probeProvider ? "probed" : "config-only",
      state: !vinauditConfigured ? "down" : providerProbe.ok ? "ready" : "degraded",
      detail: !vinauditConfigured
        ? `Not configured — missing ${missingVinAuditKeys().join(", ")}. Paid reports are disabled; sample data is never substituted.`
        : providerProbe.detail,
    },
    {
      key: "stripe",
      label: "Stripe payments",
      required: true,
      verification: "config-only",
      state: isStripeConfigured() ? "ready" : "down",
      detail: isStripeConfigured()
        ? `Secret key present for ${isStripeTestMode() ? "test" : "live"} mode. Not verified here — the first Checkout Session proves the key.`
        : "Not configured — missing STRIPE_SECRET_KEY. Checkout is disabled.",
    },
    {
      key: "stripe_webhook",
      label: "Stripe fulfillment webhook",
      required: false,
      verification: "config-only",
      state: stripeConfig.webhookSecret ? "ready" : "degraded",
      detail: stripeConfig.webhookSecret
        ? "Signing secret present at POST /api/stripe/webhook"
        : "STRIPE_WEBHOOK_SECRET not set — the webhook will reject events. Orders still fulfil on the return-from-Stripe page.",
    },
    {
      key: "storage",
      label: `Order storage · ${store.kind === "postgres" ? "PostgreSQL" : "file"}`,
      required: true,
      verification: "probed",
      state: storagePing.ok ? (store.kind === "postgres" ? "ready" : "degraded") : "down",
      detail: storagePing.ok
        ? `${store.description}. ${storagePing.detail}`
        : `${store.description}. ${storagePing.detail}`,
    },
    {
      key: "email",
      label: "Resend receipt email",
      required: false,
      verification: "config-only",
      state: isEmailConfigured() ? "ready" : "optional",
      detail: isEmailConfigured()
        ? `Configured, not verified — a key is present and mail would be sent as ${emailConfig.from}. Nothing here proves the key works or that the sending domain is verified in Resend; only a real send does. Reports are always delivered on screen regardless.`
        : "RESEND_API_KEY not set — reports are still delivered on screen, but no receipt email is sent.",
    },
    {
      key: "brief",
      label: "Written brief on the report",
      required: false,
      verification: "config-only",
      state: isAnthropicConfigured() ? "ready" : "optional",
      detail: isAnthropicConfigured()
        ? `Key present — briefs are written by ${anthropic.model} and cached on the order, so a report costs one call however often it is read. Nothing here proves the key works; the next paid report does.`
        : "ANTHROPIC_API_KEY not set — reports are delivered in full without the written brief, and no other behaviour changes.",
    },
    {
      key: "hero",
      label: "Illustrated vehicle hero",
      required: false,
      verification: "config-only",
      state: isFalConfigured() ? "ready" : "optional",
      detail: isFalConfigured()
        ? `FAL_KEY present — cutouts are drawn by ${fal.model}, backgrounds removed by ${fal.rembgModel}, and cached by year/make/model/trim/color, so a report costs two fal calls. Nothing here proves the key works; the next paid report does.`
        : "FAL_KEY not set — reports are delivered in full without an illustrated hero, and no other behaviour changes.",
    },
    {
      key: "admin",
      label: "Admin console",
      required: false,
      verification: "config-only",
      state: isAdminConfigured() ? "ready" : "optional",
      detail: isAdminConfigured()
        ? "Password protected at /admin"
        : "ADMIN_PASSWORD not set — /admin is locked out entirely.",
    },
  ];

  const ordersEnabled = checks
    .filter((check) => check.required)
    .every((check) => check.state === "ready" || check.state === "degraded");

  return {
    brand: "PullVinReport",
    checkedAt: new Date().toISOString(),
    ordersEnabled,
    price: formatPrice(),
    priceCents: pricing.amountCents,
    currency: pricing.currency,
    siteUrl: siteUrl(),
    checks,
  };
}
