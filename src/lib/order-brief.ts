import type { VehicleBrief } from "@/lib/ai-brief";
import { generateBrief } from "@/lib/ai-brief";
import { cleanBrief } from "@/lib/customer-text";
import { isAnthropicConfigured } from "@/lib/config";
import { withCurrentLayout } from "@/lib/report-layout";
import { getStore } from "@/lib/store";
import type { Order } from "@/lib/store";

export type BriefOutcome =
  | { status: "ready"; brief: VehicleBrief; cached: boolean }
  | { status: "unavailable"; reason: string };

/**
 * The order's brief, written once.
 *
 * The brief is cached on the order row, so opening the report a second time
 * costs nothing and always says the same thing — a summary that reworded itself
 * on every visit would be impossible to support. Rewriting one is an explicit
 * act, never something a page view can trigger.
 */
export async function briefForOrder(
  order: Order,
  options: { refresh?: boolean; timeoutMs?: number } = {},
): Promise<BriefOutcome> {
  if (!order.report) {
    return { status: "unavailable", reason: "this order has no report yet" };
  }
  if (order.aiBrief && !options.refresh) {
    return { status: "ready", brief: cleanBrief(order.aiBrief), cached: true };
  }
  if (!isAnthropicConfigured()) {
    return { status: "unavailable", reason: "ANTHROPIC_API_KEY is not set" };
  }

  const brief = await generateBrief(withCurrentLayout(order.report), {
    timeoutMs: options.timeoutMs,
  });
  if (!brief) {
    return { status: "unavailable", reason: "the brief could not be written" };
  }

  try {
    const store = getStore();
    await store.init();
    await store.update(order.id, {
      aiBrief: cleanBrief(brief),
      aiBriefGeneratedAt: new Date().toISOString(),
    });
  } catch (error) {
    // A brief we failed to cache is still a brief. The buyer reads it now and
    // the next visit pays for it again, which is the cheaper of the two bugs.
    console.error(`[brief] could not cache the brief for order ${order.id}`, error);
  }

  return { status: "ready", brief: cleanBrief(brief), cached: false };
}
