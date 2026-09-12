import type { OrderStatus } from "@/lib/store/types";

/** Checkout sessions that never collected money. */
export const UNPAID_CHECKOUT_STATUSES = ["pending", "expired"] as const;

/** Paid, fulfilled, or failed rows — real money or an ops failure after checkout. */
export const MONEY_ACTIVITY_STATUSES = ["paid", "fulfilled", "failed"] as const;

export type UnpaidCheckoutStatus = (typeof UNPAID_CHECKOUT_STATUSES)[number];
export type MoneyActivityStatus = (typeof MONEY_ACTIVITY_STATUSES)[number];

/** Admin calendar, matching order timestamps on /admin. */
export const ADMIN_ZONE = "America/Denver";

export function isUnpaidCheckoutStatus(
  status: OrderStatus,
): status is UnpaidCheckoutStatus {
  return status === "pending" || status === "expired";
}

export function isMoneyActivityStatus(
  status: OrderStatus,
): status is MoneyActivityStatus {
  return status === "paid" || status === "fulfilled" || status === "failed";
}

type DenverDay = { year: number; month: number; day: number };

function denverDay(date: Date): DenverDay | null {
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

/**
 * How many unpaid checkouts landed today / this month on the Denver clock.
 */
export function unpaidCheckoutWindowCounts(
  createdAts: Iterable<string>,
  now: Date = new Date(),
): { today: number; month: number } {
  const today = denverDay(now);
  if (!today) return { today: 0, month: 0 };

  let todayCount = 0;
  let monthCount = 0;
  for (const iso of createdAts) {
    const day = denverDay(new Date(iso));
    if (!day || day.year !== today.year || day.month !== today.month) continue;
    monthCount += 1;
    if (day.day === today.day) todayCount += 1;
  }
  return { today: todayCount, month: monthCount };
}

/**
 * Paid reports ÷ (paid reports + unpaid checkouts).
 *
 * Null when there is nothing to convert yet.
 */
export function checkoutConversionPercent(
  fulfilled: number,
  abandoned: number,
): number | null {
  const paid = Math.max(0, Math.trunc(fulfilled));
  const unpaid = Math.max(0, Math.trunc(abandoned));
  const denom = paid + unpaid;
  if (denom === 0) return null;
  return Math.round((paid / denom) * 100);
}
