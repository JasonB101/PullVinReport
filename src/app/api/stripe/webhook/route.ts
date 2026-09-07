import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripeConfig } from "@/lib/config";
import { fulfillOrder } from "@/lib/fulfillment";
import { getStore } from "@/lib/store";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe fulfillment webhook.
 *
 * Marks the order paid, then pulls the report. Fulfillment failures are
 * recorded on the order and returned as a 500 so Stripe retries; the customer
 * is never handed sample data in place of the report they bought.
 */
export async function POST(request: Request) {
  const secret = stripeConfig.webhookSecret;
  if (!secret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    console.error("[webhook] Signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const store = getStore();
  await store.init();

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid") break;

        const order =
          (session.metadata?.orderId
            ? await store.getById(session.metadata.orderId)
            : null) ?? (await store.getByStripeSessionId(session.id));

        if (!order) {
          console.error("[webhook] No order matches session", session.id);
          // Acknowledge: retrying will not conjure the order into existence.
          break;
        }

        if (order.status !== "fulfilled") {
          await store.update(order.id, {
            status: "paid",
            stripeSessionId: session.id,
            stripePaymentIntentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : (session.payment_intent?.id ?? null),
            email: session.customer_details?.email ?? order.email,
          });
        }

        const result = await fulfillOrder(order.id);
        console.info(
          `[webhook] Fulfilled order ${order.id} (email: ${result.emailDetail})`,
        );
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const order = await store.getByStripeSessionId(session.id);
        if (order && order.status === "pending") {
          await store.update(order.id, { status: "expired" });
        }
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const order = await store.getByStripeSessionId(session.id);
        if (order && order.status === "pending") {
          await store.update(order.id, {
            status: "failed",
            providerError: "Payment failed at Stripe",
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error(`[webhook] Handling ${event.type} failed`, error);
    // 500 tells Stripe to retry, which is what we want for a provider blip.
    return NextResponse.json(
      { error: (error as Error).message, received: true },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
