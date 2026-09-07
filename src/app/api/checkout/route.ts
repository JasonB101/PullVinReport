import { NextResponse } from "next/server";

import {
  BRAND,
  absoluteUrl,
  isStripeConfigured,
  isVinAuditConfigured,
  missingVinAuditKeys,
  pricing,
} from "@/lib/config";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";
import { getStripe } from "@/lib/stripe";
import { validateVin } from "@/lib/vin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  const limit = rateLimit(`checkout:${clientIp(request)}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: { vin?: string; email?: string };
  try {
    body = (await request.json()) as { vin?: string; email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const vinResult = validateVin(body.vin ?? "");
  if (!vinResult.valid) {
    return NextResponse.json(
      { error: vinResult.error ?? "Enter a valid 17-character VIN." },
      { status: 400 },
    );
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address so we can send your report." },
      { status: 400 },
    );
  }

  // Never sell a report we cannot deliver. Without VinAudit credentials the
  // paid path is closed — there is no sample fallback.
  if (!isVinAuditConfigured()) {
    return NextResponse.json(
      {
        error:
          "Reports are temporarily unavailable because our vehicle-data provider is not connected. No payment has been taken.",
        missing: missingVinAuditKeys(),
      },
      { status: 503 },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Checkout is temporarily unavailable because payments are not connected. No payment has been taken.",
        missing: ["STRIPE_SECRET_KEY"],
      },
      { status: 503 },
    );
  }

  const store = getStore();
  await store.init();

  const order = await store.create({
    vin: vinResult.vin,
    email,
    amountCents: pricing.amountCents,
    currency: pricing.currency,
  });

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: email,
        client_reference_id: order.id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: order.currency,
              unit_amount: order.amountCents,
              product_data: {
                name: `${BRAND.name} vehicle history report`,
                description: `Full history report for VIN ${order.vin}`,
              },
            },
          },
        ],
        metadata: { orderId: order.id, vin: order.vin },
        payment_intent_data: {
          metadata: { orderId: order.id, vin: order.vin },
          description: `${BRAND.name} report · VIN ${order.vin}`,
        },
        success_url: absoluteUrl(
          "/order/success?session_id={CHECKOUT_SESSION_ID}",
        ),
        cancel_url: absoluteUrl(
          `/preview?vin=${encodeURIComponent(order.vin)}&canceled=1`,
        ),
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      },
      // Guards against a double-click creating two Stripe sessions.
      { idempotencyKey: `checkout:${order.id}` },
    );

    await store.update(order.id, { stripeSessionId: session.id });

    return NextResponse.json({ url: session.url, orderId: order.id });
  } catch (error) {
    await store.update(order.id, {
      status: "failed",
      providerError: `Stripe checkout could not be created: ${(error as Error).message}`,
    });
    console.error("[checkout] Stripe session creation failed", error);
    return NextResponse.json(
      { error: "We couldn't start checkout. Please try again in a moment." },
      { status: 502 },
    );
  }
}
