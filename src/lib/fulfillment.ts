import {
  autoRefundFailedOrders,
  isVinAuditConfigured,
  missingVinAuditKeys,
} from "@/lib/config";
import { sendReportEmail } from "@/lib/email";
import { refundOrder } from "@/lib/refund";
import { getStore } from "@/lib/store";
import type { Order } from "@/lib/store";
import { pullVinAuditReport } from "@/lib/vinaudit";

export type FulfillmentResult = {
  order: Order;
  alreadyFulfilled: boolean;
  emailDetail: string;
};

/**
 * Gives the money back when AUTO_REFUND_FAILED_ORDERS is on.
 *
 * Never throws: the order is already recorded as failed, and a refund we could
 * not issue is an operator problem to finish from `/admin`, not a reason to
 * change what the caller sees.
 */
async function autoRefund(orderId: string): Promise<void> {
  if (!autoRefundFailedOrders()) return;
  try {
    const result = await refundOrder(orderId);
    console.info(`[fulfillment] Auto-refunded ${orderId}: ${result.detail}`);
  } catch (error) {
    console.error(`[fulfillment] Auto-refund failed for ${orderId}`, error);
  }
}

/**
 * Turns a paid order into a delivered report.
 *
 * Safe to call more than once — Stripe retries webhooks, and the success page
 * also nudges fulfillment in case the webhook is delayed.
 *
 * If VinAudit is not configured or the pull fails, the order is marked `failed`
 * with the provider error recorded and the function throws. Under no
 * circumstance does it substitute sample data for a paid report.
 */
export async function fulfillOrder(orderId: string): Promise<FulfillmentResult> {
  const store = getStore();
  const order = await store.getById(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  if (order.status === "fulfilled" && order.report) {
    return { order, alreadyFulfilled: true, emailDetail: "Already delivered" };
  }
  if (order.status === "pending") {
    throw new Error(`Order ${orderId} has not been paid yet`);
  }

  if (!isVinAuditConfigured()) {
    const detail = `VinAudit is not configured (missing ${missingVinAuditKeys().join(", ")}). This paid order cannot be fulfilled and must be refunded or retried once credentials are set.`;
    await store.update(order.id, { status: "failed", providerError: detail });
    await autoRefund(order.id);
    throw new Error(detail);
  }

  let report;
  try {
    report = await pullVinAuditReport(order.vin);
  } catch (error) {
    const detail = (error as Error).message;
    await store.update(order.id, { status: "failed", providerError: detail });
    await autoRefund(order.id);
    throw error;
  }

  const fulfilled = await store.update(order.id, {
    status: "fulfilled",
    report,
    providerError: null,
    fulfilledAt: new Date().toISOString(),
  });

  const email = await sendReportEmail(fulfilled);
  const finalOrder = email.sent
    ? await store.update(fulfilled.id, { emailSentAt: new Date().toISOString() })
    : fulfilled;

  return {
    order: finalOrder,
    alreadyFulfilled: false,
    emailDetail: email.detail,
  };
}
