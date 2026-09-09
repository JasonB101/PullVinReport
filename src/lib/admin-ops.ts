/**
 * Operator-only helpers for the /admin console.
 *
 * Nothing here is imported by customer pages. The first-sales goal is a
 * private milestone, not a public thermometer.
 */
import { formatPrice } from "@/lib/config";

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
