"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  endAdminSession,
  isAdminAuthenticated,
  startAdminSession,
  verifyPassword,
} from "@/lib/admin-auth";
import { isAdminConfigured } from "@/lib/config";
import { sendReportEmail } from "@/lib/email";
import { fulfillOrder } from "@/lib/fulfillment";
import { headers } from "next/headers";

import { rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";

export type LoginState = { error?: string };

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!isAdminConfigured()) {
    return { error: "ADMIN_PASSWORD is not set on this deployment." };
  }

  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const limit = rateLimit(`admin-login:${ip}`, 8, 5 * 60_000);
  if (!limit.allowed) {
    return {
      error: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
    };
  }

  const password = String(formData.get("password") ?? "");
  if (!verifyPassword(password)) {
    return { error: "Incorrect password." };
  }

  await startAdminSession();
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await endAdminSession();
  redirect("/admin/login");
}

export type RetryState = { message?: string; error?: string };

/** Re-runs fulfillment for an order that was paid but never delivered. */
export async function retryFulfillmentAction(
  _previous: RetryState,
  formData: FormData,
): Promise<RetryState> {
  if (!(await isAdminAuthenticated())) {
    return { error: "Your session expired. Sign in again." };
  }

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Missing order id." };

  try {
    const result = await fulfillOrder(orderId);
    revalidatePath("/admin");
    return {
      message: result.alreadyFulfilled
        ? "Order was already fulfilled."
        : `Report pulled. Email: ${result.emailDetail}`,
    };
  } catch (error) {
    revalidatePath("/admin");
    return { error: (error as Error).message };
  }
}

/** Re-sends the receipt and report link for an already-fulfilled order. */
export async function resendEmailAction(
  _previous: RetryState,
  formData: FormData,
): Promise<RetryState> {
  if (!(await isAdminAuthenticated())) {
    return { error: "Your session expired. Sign in again." };
  }

  const orderId = String(formData.get("orderId") ?? "");
  const store = getStore();
  const order = await store.getById(orderId);
  if (!order) return { error: "Order not found." };
  if (order.status !== "fulfilled") {
    return { error: "Only fulfilled orders can have their email re-sent." };
  }

  const result = await sendReportEmail(order);
  if (result.sent) {
    await store.update(order.id, { emailSentAt: new Date().toISOString() });
    revalidatePath("/admin");
    return { message: `Re-sent to ${order.email}.` };
  }
  return { error: result.detail };
}
