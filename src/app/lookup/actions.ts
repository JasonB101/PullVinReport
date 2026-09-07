"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";

export type LookupState = { error?: string };

/**
 * Re-opens a report for someone who lost the emailed link. Requires both the
 * order reference and the email it was bought with, so a leaked order id alone
 * is not enough to read a report.
 */
export async function lookupAction(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const limit = rateLimit(`lookup:${ip}`, 10, 5 * 60_000);
  if (!limit.allowed) {
    return {
      error: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
    };
  }

  const orderId = String(formData.get("orderId") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!orderId || !email) {
    return { error: "Enter both your order reference and your email address." };
  }

  const store = getStore();
  await store.init();
  const order = await store.getById(orderId);

  // Same message either way so this can't be used to probe for valid order ids.
  const mismatch = {
    error:
      "We couldn't match that order reference and email. Check both, or email support and we'll find it for you.",
  };

  if (!order || order.email.toLowerCase() !== email) return mismatch;

  redirect(`/report/${order.accessToken}`);
}
