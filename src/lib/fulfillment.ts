import {
  autoRefundFailedOrders,
  isVinAuditConfigured,
  missingVinAuditKeys,
} from "@/lib/config";
import { sendReportEmail } from "@/lib/email";
import { extrasForReport } from "@/lib/model-extras";
import { briefForOrder } from "@/lib/order-brief";
import { refundOrder } from "@/lib/refund";
import { withCurrentLayout } from "@/lib/report-layout";
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
 * How long fulfillment will wait for the brief before sending without it.
 *
 * Shorter than a page view's budget on purpose. Fulfillment usually runs inside
 * a Stripe webhook, and Stripe gives the endpoint about 30 seconds before it
 * calls the delivery failed and retries — a report pull plus a full-length model
 * call can cross that line. Fifteen seconds is what is left over from that
 * window once a slow provider has had its turn, and missing it costs only the
 * brief in the attached PDF: the page writes one on the first view regardless.
 */
const BRIEF_BUDGET_MS = 15_000;

/**
 * Writes the brief before the receipt goes out.
 *
 * The PDF is the copy a buyer forwards to a mechanic or a seller, so it has to
 * say what the page says; without this it never carried a brief at all, because
 * the brief was not written until someone opened the report. Best-effort: a
 * brief that does not arrive in time is written on the first page view instead,
 * and the receipt leaves on schedule either way.
 */
async function withBrief(order: Order): Promise<Order> {
  try {
    const outcome = await briefForOrder(order, { timeoutMs: BRIEF_BUDGET_MS });
    if (outcome.status === "ready") return { ...order, aiBrief: outcome.brief };
    console.info(`[fulfillment] No brief for ${order.id}: ${outcome.reason}`);
  } catch (error) {
    console.error(`[fulfillment] Brief failed for ${order.id}`, error);
  }
  return order;
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

  const [briefed, modelExtras] = await Promise.all([
    withBrief(fulfilled),
    extrasForReport(withCurrentLayout(report), store).catch((error) => {
      console.error(`[fulfillment] Model extras failed for ${order.id}`, error);
      return null;
    }),
  ]);

  const email = await sendReportEmail(briefed, modelExtras);
  const finalOrder = email.sent
    ? await store.update(briefed.id, { emailSentAt: new Date().toISOString() })
    : briefed;

  return {
    order: finalOrder,
    alreadyFulfilled: false,
    emailDetail: email.detail,
  };
}
