import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/admin-auth";
import { buildStatusReport } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Machine-readable provider readiness.
 *
 * Anonymous callers get only whether orders are open — no provider names or
 * API probe detail. Signed-in admins get the full report. Returns 503 when
 * the paid path cannot run, so uptime monitors still alert without leaking
 * wholesale-vendor names to a public visitor.
 */
export async function GET(request: Request) {
  const admin = await isAdminAuthenticated();
  const probe = admin && new URL(request.url).searchParams.get("probe") !== "0";
  const report = await buildStatusReport({ probeProvider: probe });
  const payload = admin
    ? report
    : { ordersEnabled: report.ordersEnabled, checkedAt: report.checkedAt };

  return NextResponse.json(payload, {
    status: report.ordersEnabled ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
