import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { adminConfig, isAdminConfigured } from "@/lib/config";

export const ADMIN_COOKIE = "pvr_admin";

/**
 * Derives the session value from ADMIN_PASSWORD, so rotating the password
 * invalidates every existing session without any server-side session store.
 */
function expectedToken(): string | null {
  const password = adminConfig.password;
  if (!password) return null;
  return createHmac("sha256", password).update("pullvinreport-admin-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function verifyPassword(candidate: string): boolean {
  const password = adminConfig.password;
  if (!password) return false;
  return safeEqual(candidate, password);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const expected = expectedToken();
  if (!expected) return false;
  const cookie = (await cookies()).get(ADMIN_COOKIE)?.value;
  return Boolean(cookie && safeEqual(cookie, expected));
}

export async function startAdminSession(): Promise<void> {
  const token = expectedToken();
  if (!token) throw new Error("ADMIN_PASSWORD is not set");
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}
