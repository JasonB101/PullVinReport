import Stripe from "stripe";

import { BRAND, stripeConfig } from "@/lib/config";

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured. Set STRIPE_SECRET_KEY to accept payments.");
    this.name = "StripeNotConfiguredError";
  }
}

let client: Stripe | null = null;
let clientKey: string | null = null;

export function getStripe(): Stripe {
  const key = stripeConfig.secretKey;
  if (!key) throw new StripeNotConfiguredError();
  if (!client || clientKey !== key) {
    client = new Stripe(key, {
      appInfo: { name: BRAND.name, url: BRAND.url },
      // Pin Node HTTP so /admin balance.retrieve() is not a Next-patched
      // GET fetch. Checkout already uses this helper and works.
      httpClient: Stripe.createNodeHttpClient(),
    });
    clientKey = key;
  }
  return client;
}

/** Live USD available / pending via the official Stripe SDK. */
export async function retrieveStripeBalance(
  options: { timeoutMs?: number } = {},
): Promise<Stripe.Balance> {
  return getStripe().balance.retrieve(
    {},
    options.timeoutMs != null ? { timeout: options.timeoutMs } : undefined,
  );
}

export function isStripeTestMode(): boolean {
  return Boolean(stripeConfig.secretKey?.startsWith("sk_test_"));
}
