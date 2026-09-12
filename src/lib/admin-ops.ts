/**
 * Operator-only helpers for the /admin console.
 *
 * Nothing here is imported by customer pages. The first-sales goal is a
 * private milestone, not a public thermometer.
 */
import { formatPrice } from "@/lib/config";
import type { OrderStats } from "@/lib/store";
import { checkoutConversionPercent } from "@/lib/store/unpaid-checkouts";

export {
  MONEY_ACTIVITY_STATUSES,
  UNPAID_CHECKOUT_STATUSES,
} from "@/lib/store/unpaid-checkouts";

/** Shown on unpaid Pending / expired rows so they are never read as orders. */
export const ABANDONED_CHECKOUT_LABEL = "Abandoned checkout (not paid)";

/**
 * Customer report page for a fulfilled order. Same path as "View report"
 * on /admin — never used for unpaid / abandoned checkouts.
 */
export function orderReportHref(accessToken: string): string {
  return `/report/${accessToken}`;
}

export type AbandonedCheckoutStats = {
  total: number;
  today: number;
  month: number;
  conversionPercent: number | null;
  conversionLabel: string;
};

/**
 * Unpaid-checkout tiles for /admin.
 *
 * Conversion is fulfilled / (fulfilled + abandoned). Pending sessions still
 * waiting on Stripe's expire webhook count as abandoned — they were never paid.
 */
export function abandonedCheckoutStats(
  stats: Pick<
    OrderStats,
    "abandoned" | "abandonedToday" | "abandonedMonth" | "fulfilled"
  >,
): AbandonedCheckoutStats {
  const percent = checkoutConversionPercent(stats.fulfilled, stats.abandoned);
  return {
    total: stats.abandoned,
    today: stats.abandonedToday,
    month: stats.abandonedMonth,
    conversionPercent: percent,
    conversionLabel:
      percent === null ? "No checkouts yet" : `${percent}% paid`,
  };
}

/** First live-sales milestone, in cents. */
export const FIRST_SALES_GOAL_CENTS = 100_000;

export type FirstSalesGoal = {
  collectedCents: number;
  goalCents: number;
  remainingCents: number;
  percent: number;
  reached: boolean;
  label: string;
};

/**
 * How close collected revenue is to the first $1,000.
 *
 * `collectedCents` is kept money (refunds already excluded by the store).
 */
export function firstSalesGoal(
  collectedCents: number,
  goalCents: number = FIRST_SALES_GOAL_CENTS,
): FirstSalesGoal {
  const collected = Math.max(0, Math.trunc(collectedCents));
  const goal = Math.max(1, Math.trunc(goalCents));
  const remaining = Math.max(0, goal - collected);
  const percent = Math.min(100, Math.round((collected / goal) * 100));
  const reached = collected >= goal;
  const label = reached
    ? `${formatPrice(collected)} collected — first ${formatPrice(goal)} reached`
    : `${formatPrice(collected)} of ${formatPrice(goal)} collected`;
  return {
    collectedCents: collected,
    goalCents: goal,
    remainingCents: remaining,
    percent,
    reached,
    label,
  };
}
