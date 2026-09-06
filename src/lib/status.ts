import {
  emailConfig,
  formatPrice,
  isAdminConfigured,
  isEmailConfigured,
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

export type StatusCheck = {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
  /** True when the paid path cannot run without this check passing. */
  required: boolean;
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
      state: !vinauditConfigured ? "down" : providerProbe.ok ? "ready" : "degraded",
      detail: !vinauditConfigured
        ? `Not configured — missing ${missingVinAuditKeys().join(", ")}. Paid reports are disabled; sample data is never substituted.`
        : providerProbe.detail,
    },
    {
      key: "stripe",
      label: "Stripe payments",
      required: true,
      state: isStripeConfigured() ? "ready" : "down",
      detail: isStripeConfigured()
        ? `Connected in ${isStripeTestMode() ? "test" : "live"} mode`
        : "Not configured — missing STRIPE_SECRET_KEY. Checkout is disabled.",
    },
    {
      key: "stripe_webhook",
      label: "Stripe fulfillment webhook",
      required: false,
      state: stripeConfig.webhookSecret ? "ready" : "degraded",
      detail: stripeConfig.webhookSecret
        ? "Signing secret present at POST /api/stripe/webhook"
        : "STRIPE_WEBHOOK_SECRET not set — the webhook will reject events. Orders still fulfil on the return-from-Stripe page.",
    },
    {
      key: "storage",
      label: `Order storage · ${store.kind === "postgres" ? "PostgreSQL" : "file"}`,
      required: true,
      state: storagePing.ok ? (store.kind === "postgres" ? "ready" : "degraded") : "down",
      detail: storagePing.ok
        ? `${store.description}. ${storagePing.detail}`
        : `${store.description}. ${storagePing.detail}`,
    },
    {
      key: "email",
      label: "Resend receipt email",
      required: false,
      state: isEmailConfigured() ? "ready" : "optional",
      detail: isEmailConfigured()
        ? `Sending from ${emailConfig.from}`
        : "RESEND_API_KEY not set — reports are still delivered on screen, but no receipt email is sent.",
    },
    {
      key: "admin",
      label: "Admin console",
      required: false,
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
