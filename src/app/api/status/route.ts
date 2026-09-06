import { NextResponse } from "next/server";

import { buildStatusReport } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Machine-readable provider readiness. Returns 503 when the paid path cannot
 * run, so uptime monitors alert before customers hit a broken checkout.
 */
export async function GET(request: Request) {
  const probe = new URL(request.url).searchParams.get("probe") !== "0";
  const report = await buildStatusReport({ probeProvider: probe });
  return NextResponse.json(report, {
    status: report.ordersEnabled ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
