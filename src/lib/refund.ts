import { formatPrice } from "@/lib/config";
import { sendRefundEmail } from "@/lib/email";
import { getStore } from "@/lib/store";
import type { Order } from "@/lib/store";
import { getStripe } from "@/lib/stripe";

export type RefundResult = {
  order: Order;
  alreadyRefunded: boolean;
  /** Operator-facing summary, safe for `/admin` but not for a buyer. */
  detail: string;
};

/**
 * Sends a charge back through Stripe and records it on the order.
 *
 * Safe to call more than once: an order that already carries `refundedAt` is
 * returned untouched, and the Stripe call is keyed on the order id so a
 * double-click cannot refund twice.
 *
 * The customer email is best-effort — a mail failure must not make us think
 * the refund did not happen.
 */
export async function refundOrder(
  orderId: string,
  options: { notifyCustomer?: boolean } = {},
): Promise<RefundResult> {
  const { notifyCustomer = true } = options;
  const store = getStore();
  const order = await store.getById(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  if (order.refundedAt) {
    return {
      order,
      alreadyRefunded: true,
      detail: `Already refunded on ${order.refundedAt.slice(0, 10)}.`,
    };
  }
  if (!order.stripePaymentIntentId) {
    throw new Error(
      "This order has no Stripe payment on record, so there is nothing to refund.",
    );
  }

  const refund = await getStripe().refunds.create(
    {
      payment_intent: order.stripePaymentIntentId,
      reason: "requested_by_customer",
      metadata: { orderId: order.id, vin: order.vin },
    },
    { idempotencyKey: `refund:${order.id}` },
  );

  const refunded = await store.update(order.id, {
    refundedAt: new Date().toISOString(),
    stripeRefundId: refund.id,
  });

  let emailDetail = "Customer not notified";
  if (notifyCustomer) {
    const email = await sendRefundEmail(refunded);
    emailDetail = email.detail;
  }

  return {
    order: refunded,
    alreadyRefunded: false,
    detail: `Refunded ${formatPrice(refunded.amountCents, refunded.currency)} (${refund.id}). Email: ${emailDetail}`,
  };
}

/**
 * Records a refund that was issued outside the app — typically from the Stripe
 * dashboard — so `/admin` and the customer's report page agree with Stripe.
 */
export async function recordExternalRefund(
  paymentIntentId: string,
  refundId: string | null,
): Promise<Order | null> {
  const store = getStore();
  const order = await store.getByStripePaymentIntentId(paymentIntentId);
  if (!order || order.refundedAt) return order;

  return store.update(order.id, {
    refundedAt: new Date().toISOString(),
    stripeRefundId: refundId,
  });
}
