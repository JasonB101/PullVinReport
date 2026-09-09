import Stripe from "stripe";

import { stripeConfig } from "@/lib/config";

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
      appInfo: { name: "PullVinReport", url: "https://pullvinreport.com" },
    });
    clientKey = key;
  }
  return client;
}

/** Live USD available / pending via the official Stripe SDK. */
export async function retrieveStripeBalance(): Promise<Stripe.Balance> {
  return getStripe().balance.retrieve();
}

export function isStripeTestMode(): boolean {
  return Boolean(stripeConfig.secretKey?.startsWith("sk_test_"));
}
