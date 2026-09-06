import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { buildStatusReport, type CheckState } from "@/lib/status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Service status",
  description:
    "Live readiness of the PullVinReport data provider, payments, storage and email.",
  robots: { index: false, follow: true },
};

const STATE_STYLES: Record<CheckState, { chip: string; label: string; dot: string }> = {
  ready: {
    chip: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    label: "Ready",
    dot: "bg-emerald-500",
  },
  degraded: {
    chip: "bg-amber-50 text-amber-800 ring-amber-200",
    label: "Degraded",
    dot: "bg-amber-500",
  },
  down: {
    chip: "bg-red-50 text-red-800 ring-red-200",
    label: "Not configured",
    dot: "bg-red-500",
  },
  optional: {
    chip: "bg-slate-100 text-slate-600 ring-slate-200",
    label: "Optional",
    dot: "bg-slate-400",
  },
};

export default async function StatusPage() {
  const report = await buildStatusReport();

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <SiteHeader />

      <main className="flex-1">
        <div className="border-b border-slate-200 bg-white">
          <div className="container-page py-10 sm:py-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              Service status
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Can we deliver a report right now?
            </h1>

            <div
              className={`mt-6 inline-flex items-center gap-3 rounded-2xl px-5 py-3.5 ring-1 ${
                report.ordersEnabled
                  ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
                  : "bg-red-50 text-red-900 ring-red-200"
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  report.ordersEnabled ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              <span className="text-sm font-semibold">
                {report.ordersEnabled
                  ? `Orders are open at ${report.price} per report`
                  : "Orders are closed — a required service is not configured"}
              </span>
            </div>

            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-600">
              We only accept payment when the VinAudit Vehicle History API is
              connected. If the provider is unavailable, checkout is switched
              off rather than delivering sample data as if it were a real
              report.
            </p>
          </div>
        </div>

        <div className="container-page py-10 sm:py-12">
          <div className="space-y-3">
            {report.checks.map((check) => {
              const styles = STATE_STYLES[check.state];
              return (
                <div
                  key={check.key}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
                      <h2 className="text-sm font-semibold text-slate-900">
                        {check.label}
                      </h2>
                      {check.required && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
                      {check.detail}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${styles.chip}`}
                  >
                    {styles.label}
                  </span>
                </div>
              );
            })}
          </div>

          <dl className="mt-8 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Report price
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {report.price}{" "}
                <span className="text-slate-400">
                  ({report.priceCents} {report.currency})
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Site URL
              </dt>
              <dd className="mt-1 truncate text-sm text-slate-800">
                {report.siteUrl}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Checked
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {new Date(report.checkedAt).toISOString().replace("T", " ").slice(0, 19)} UTC
              </dd>
            </div>
          </dl>

          <p className="mt-6 text-sm text-slate-500">
            Machine-readable version:{" "}
            <Link
              href="/api/status"
              className="font-mono font-semibold text-brand-600 hover:underline"
            >
              /api/status
            </Link>{" "}
            (returns HTTP 503 when orders are closed).
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
